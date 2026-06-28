#!/usr/bin/env python3
"""Deploy and inspect MetaEdit in Obsidian iOS over USB.

This harness follows the proven safdeb/podnotes_ios.py pattern:

	uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py diagnose
	uv run --no-project --with pymobiledevice3 python scripts/mobile/metaedit_ios.py eval --file scripts/mobile/probes/issue99_frontmatter.js

Deploy writes into the phone's real Obsidian vault. It intentionally requires an
explicit flag, creates a local backup of the existing phone plugin folder first,
and byte-verifies every pushed artifact.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import hashlib
import json
import logging
import os
import posixpath
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.services.house_arrest import HouseArrestService
from pymobiledevice3.services.webinspector import WebinspectorService

OBSIDIAN_BUNDLE = "md.obsidian"
PLUGIN_ID = "metaedit"
REPO = Path(__file__).resolve().parents[2]
DEFAULT_VAULT = "notes"
TOKEN = "__metaedit_ios_debug_result"
SOURCE_TOKEN = "__metaedit_ios_debug_source"
INSPECTOR_CALL_TIMEOUT = 10.0
EVAL_CHUNK_SIZE = 768

LOCAL_FILES = {
	"main.js": REPO / "main.js",
	"manifest.json": REPO / "manifest.json",
	"styles.css": REPO / "styles.css",
}


def backup_root() -> Path:
	return Path(os.environ.get(
		"METAEDIT_IOS_BACKUP_DIR",
		Path.home() / ".metaedit-mobile-backups" / PLUGIN_ID,
	)).expanduser()


def js(value: str) -> str:
	return json.dumps(value)


def sha256(data: bytes) -> str:
	return hashlib.sha256(data).hexdigest()


def safe_segment(value: str) -> str:
	return re.sub(r"[^A-Za-z0-9_.-]+", "-", value).strip("-") or "unknown"


async def afc_open(lockdown: Any) -> HouseArrestService:
	return await HouseArrestService.create(lockdown, OBSIDIAN_BUNDLE, documents_only=True)


async def afc_find_vault(afc: HouseArrestService, prefer: str | None) -> tuple[str, list[str]]:
	candidates: list[str] = []
	for name in await afc.listdir("/Documents"):
		if name in (".", "..", ""):
			continue
		path = f"/Documents/{name}"
		try:
			if await afc.exists(f"{path}/.obsidian"):
				candidates.append(name)
		except Exception:
			continue

	if prefer and prefer != "auto":
		if prefer in candidates:
			return f"/Documents/{prefer}", candidates
		raise SystemExit(
			f"Vault {prefer!r} was not found under /Documents. "
			f"Vaults with .obsidian: {candidates or '(none)'}"
		)

	if len(candidates) == 1:
		return f"/Documents/{candidates[0]}", candidates
	if DEFAULT_VAULT in candidates:
		return f"/Documents/{DEFAULT_VAULT}", candidates
	if candidates:
		raise SystemExit(
			"Multiple Obsidian vaults were found. Re-run with --vault <name>. "
			f"Vaults: {candidates}"
		)
	raise SystemExit("No Obsidian vault with a .obsidian folder was found under /Documents.")


async def open_session(inspector: WebinspectorService) -> tuple[Any, Any]:
	pages = await inspector.get_open_application_pages(timeout=3)
	target = next(
		(
			page for page in pages
			if page.application.bundle == OBSIDIAN_BUNDLE
			or "obsidian" in (page.application.name or "").lower()
		),
		None,
	)
	if target is None:
		raise SystemExit(
			"No Obsidian page found. Unlock the phone, open Obsidian, and enable "
			"Settings > Apps > Safari > Advanced > Web Inspector.\n"
			f"Inspectable pages seen: {[str(page) for page in pages]}"
		)

	session = await inspector.inspector_session(target.application, target.page)
	await session.runtime_enable()
	return target, session


async def runtime_evaluate(
	session: Any,
	expression: str,
	*,
	return_by_value: bool = True,
	timeout: float = INSPECTOR_CALL_TIMEOUT,
) -> Any:
	try:
		return await asyncio.wait_for(
			session.runtime_evaluate(expression, return_by_value=return_by_value),
			timeout=timeout,
		)
	except TimeoutError as exc:
		raise TimeoutError(
			f"Web Inspector Runtime.evaluate timed out after {timeout}s: {expression[:120]}"
		) from exc


async def ev(session: Any, expr: str, timeout: float = 30.0) -> Any:
	encoded = base64.b64encode(expr.encode("utf-8")).decode("ascii")
	await runtime_evaluate(session, f"window.{SOURCE_TOKEN}='';0")
	for index in range(0, len(encoded), EVAL_CHUNK_SIZE):
		await runtime_evaluate(
			session,
			f"window.{SOURCE_TOKEN}+={js(encoded[index:index + EVAL_CHUNK_SIZE])};0",
		)

	kickoff = (
		f"(()=>{{const __bytes=Uint8Array.from(atob(window.{SOURCE_TOKEN}),c=>c.charCodeAt(0));"
		f"const __source=new TextDecoder('utf-8').decode(__bytes);"
		f"window.{TOKEN}=undefined;"
		f"(async()=>{{try{{const __runner=new Function('return (async()=>{{return await ('+__source+');}})()');"
		f"window.{TOKEN}={{ok:JSON.stringify(await __runner())}}}}"
		f"catch(e){{window.{TOKEN}={{err:String((e&&e.stack)||e)}}}}}})();return 0}})()"
	)
	await runtime_evaluate(session, kickoff)

	waited = 0.0
	poll = f"JSON.stringify(window.{TOKEN}===undefined?null:window.{TOKEN})"
	while waited < timeout:
		result = await runtime_evaluate(session, poll)
		if result and result != "null":
			obj = json.loads(result)
			if "err" in obj:
				raise RuntimeError(obj["err"])
			value = obj.get("ok")
			if value is None:
				return None
			try:
				return json.loads(value)
			except (TypeError, json.JSONDecodeError):
				return value
		await asyncio.sleep(0.1)
		waited += 0.1
	raise TimeoutError(f"eval timed out after {timeout}s: {expr[:120]}")


async def read_plugin_state(session: Any) -> dict[str, Any]:
	return await ev(session, f"""(() => {{
		const id = {js(PLUGIN_ID)};
		const plugin = app.plugins.plugins[id];
		return {{
			vaultName: app.vault.getName?.() ?? null,
			configDir: app.vault.configDir,
			manifestKnown: app.plugins.manifests[id] ?? null,
			enabled: Array.from(app.plugins.enabledPlugins ?? []).includes(id),
			instantiated: Boolean(plugin),
			loadedVersion: plugin?.manifest?.version ?? null,
			apiReady: Boolean(plugin?.api),
			hasRunCommand: Boolean(app.commands?.commands?.[`${{id}}:metaEditRun`]),
		}};
	}})()""")


def required_local_files() -> dict[str, Path]:
	missing = [str(path) for path in LOCAL_FILES.values() if not path.is_file()]
	if missing:
		raise SystemExit(
			"Missing deploy artifact(s):\n  "
			+ "\n  ".join(missing)
			+ "\nRun `pnpm run build` before deploying to mobile."
		)
	return dict(LOCAL_FILES)


async def afc_put_verified(afc: HouseArrestService, remote_path: str, data: bytes) -> dict[str, Any]:
	await afc.set_file_contents(remote_path, data)
	remote = await afc.get_file_contents(remote_path)
	remote_bytes = bytes(remote)
	local_hash = sha256(data)
	remote_hash = sha256(remote_bytes)
	return {
		"bytes": len(remote_bytes),
		"ok": len(remote_bytes) == len(data) and remote_hash == local_hash,
		"sha256": remote_hash,
		"wantBytes": len(data),
		"wantSha256": local_hash,
	}


async def collect_remote_file_manifest(afc: HouseArrestService, remote_dir: str) -> dict[str, dict[str, Any]]:
	files: dict[str, dict[str, Any]] = {}
	async for dirpath, _dirnames, filenames in afc.walk(remote_dir):
		for filename in filenames:
			remote_path = posixpath.join(dirpath, filename)
			relpath = posixpath.relpath(remote_path, remote_dir)
			data = bytes(await afc.get_file_contents(remote_path))
			files[relpath] = {
				"bytes": len(data),
				"sha256": sha256(data),
			}
	return files


def collect_local_file_manifest(local_dir: Path) -> dict[str, dict[str, Any]]:
	files: dict[str, dict[str, Any]] = {}
	for path in sorted(local_dir.rglob("*")):
		if not path.is_file():
			continue
		data = path.read_bytes()
		files[path.relative_to(local_dir).as_posix()] = {
			"bytes": len(data),
			"sha256": sha256(data),
		}
	return files


async def backup_existing_plugin(
	afc: HouseArrestService,
	remote_plugin_dir: str,
	device_id: str,
	vault_name: str,
	state: dict[str, Any] | None,
) -> Path:
	stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
	target = backup_root() / safe_segment(device_id) / safe_segment(vault_name) / stamp
	target.mkdir(parents=True, exist_ok=False)

	exists = await afc.exists(remote_plugin_dir)
	file_manifest: dict[str, dict[str, Any]] = {}
	if exists:
		file_manifest = await collect_remote_file_manifest(afc, remote_plugin_dir)
		await afc.pull(remote_plugin_dir, str(target), progress_bar=False)
		local_plugin_dir = target / posixpath.basename(remote_plugin_dir)
		local_manifest = collect_local_file_manifest(local_plugin_dir)
		if local_manifest != file_manifest:
			raise SystemExit(
				"Pre-deploy backup verification failed; refusing to write to the phone. "
				f"Backup: {target}"
			)

	manifest = {
		"createdAt": stamp,
		"deviceId": device_id,
		"pluginId": PLUGIN_ID,
		"repo": str(REPO),
		"remotePluginDir": remote_plugin_dir,
		"remotePluginDirExisted": exists,
		"vaultName": vault_name,
		"fileManifest": file_manifest,
		"stateBeforeDeploy": state,
		"note": "Created by scripts/mobile/metaedit_ios.py before writing to an Obsidian iOS vault.",
	}
	(target / "backup-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
	return target


def latest_backup() -> Path:
	root = backup_root()
	if not root.exists():
		raise SystemExit(f"No backup directory exists yet: {root}")
	manifests = sorted(root.glob("*/*/*/backup-manifest.json"), key=lambda path: path.stat().st_mtime)
	if not manifests:
		raise SystemExit(f"No backups found below {root}")
	return manifests[-1].parent


async def apply_enabled_state(session: Any, desired_enabled: bool | None) -> dict[str, Any]:
	if desired_enabled is None:
		return {"ok": True, "skipped": True, "reason": "No previous enabled state recorded."}
	return await ev(session, f"""(async () => {{
		const id = {js(PLUGIN_ID)};
		try {{
			await app.plugins.loadManifests();
			if ({json.dumps(desired_enabled)}) {{
				await (app.plugins.enablePluginAndSave
					? app.plugins.enablePluginAndSave(id)
					: app.plugins.enablePlugin(id));
			}} else {{
				if (app.plugins.plugins[id]) {{
					await (app.plugins.disablePluginAndSave
						? app.plugins.disablePluginAndSave(id)
						: app.plugins.disablePlugin(id));
				}}
			}}
			return {{
				ok: true,
				enabled: Array.from(app.plugins.enabledPlugins ?? []).includes(id),
				instantiated: Boolean(app.plugins.plugins[id]),
				version: app.plugins.plugins[id]?.manifest?.version ?? null,
			}};
		}} catch (e) {{
			return {{ok: false, error: String((e && e.stack) || e)}};
		}}
	}})()""")


async def enable_metaedit(session: Any) -> dict[str, Any]:
	return await ev(session, f"""(async () => {{
		const id = {js(PLUGIN_ID)};
		try {{
			await app.plugins.loadManifests();
			if (app.plugins.plugins[id]) await app.plugins.disablePlugin(id);
			await (app.plugins.enablePluginAndSave
				? app.plugins.enablePluginAndSave(id)
				: app.plugins.enablePlugin(id));
			return {{
				ok: true,
				enabled: Array.from(app.plugins.enabledPlugins ?? []).includes(id),
				instantiated: Boolean(app.plugins.plugins[id]),
				version: app.plugins.plugins[id]?.manifest?.version ?? null,
				apiReady: Boolean(app.plugins.plugins[id]?.api),
			}};
		}} catch (e) {{
			return {{ok: false, error: String((e && e.stack) || e)}};
		}}
	}})()""")


def assert_open_vault_matches_afc_vault(state: dict[str, Any], vault_name: str) -> None:
	open_vault = state.get("vaultName")
	if open_vault != vault_name:
		raise SystemExit(
			"Refusing to deploy because the AFC target vault and the open Obsidian vault differ.\n"
			f"AFC target vault: {vault_name!r}\n"
			f"Open Obsidian vault: {open_vault!r}\n"
			"Open the target vault on the phone, then rerun diagnose/deploy."
		)


async def cmd_diagnose(lockdown: Any, args: argparse.Namespace) -> None:
	inspector = WebinspectorService(lockdown=lockdown)
	await inspector.connect()
	try:
		async with inspector:
			target, session = await open_session(inspector)
			state = await read_plugin_state(session)
			print(f"# Web Inspector target\n{target}\n")
			print("# Runtime plugin state")
			print(json.dumps(state, indent=2, ensure_ascii=False))
	finally:
		await inspector.close()

	afc = await afc_open(lockdown)
	try:
		vault_path, vaults = await afc_find_vault(afc, args.vault)
		plugin_dir = f"{vault_path}/.obsidian/plugins/{PLUGIN_ID}"
		print("\n# AFC vault state")
		print(json.dumps({
			"vaultPath": vault_path,
			"vaults": vaults,
			"pluginDir": plugin_dir,
			"pluginDirExists": await afc.exists(plugin_dir),
			"pluginFiles": await afc.listdir(plugin_dir) if await afc.exists(plugin_dir) else [],
		}, indent=2, ensure_ascii=False))
	finally:
		await afc.close()


async def cmd_deploy(lockdown: Any, args: argparse.Namespace) -> None:
	if not args.confirm_real_vault:
		raise SystemExit(
			"Refusing to deploy without --confirm-real-vault. This writes to the phone's real Obsidian vault."
		)
	files = required_local_files()

	inspector = WebinspectorService(lockdown=lockdown)
	await inspector.connect()
	try:
		async with inspector:
			_, session = await open_session(inspector)
			state_before = await read_plugin_state(session)

			afc = await afc_open(lockdown)
			try:
				vault_path, _vaults = await afc_find_vault(afc, args.vault)
				vault_name = vault_path.rsplit("/", 1)[-1]
				plugin_dir = f"{vault_path}/.obsidian/plugins/{PLUGIN_ID}"
				device_id = getattr(lockdown, "udid", None) or getattr(lockdown, "identifier", None) or "usb-device"
				assert_open_vault_matches_afc_vault(state_before, vault_name)
				backup_dir = await backup_existing_plugin(afc, plugin_dir, str(device_id), vault_name, state_before)

				print(f"# backup\n{backup_dir}\n")
				print(f"# deploy target\n{plugin_dir}\n")

				try:
					await afc.makedirs(plugin_dir)
				except Exception:
					pass

				results: dict[str, Any] = {}
				for name, path in files.items():
					data = path.read_bytes()
					results[name] = await afc_put_verified(afc, f"{plugin_dir}/{name}", data)
				results[".hotreload"] = await afc_put_verified(afc, f"{plugin_dir}/.hotreload", b"")

				print("# pushed files")
				print(json.dumps(results, indent=2, ensure_ascii=False))
				if not all(result.get("ok") for result in results.values()):
					raise SystemExit("At least one pushed file failed byte verification.")
			finally:
				await afc.close()

			enable_result = await enable_metaedit(session)
			state_after = await read_plugin_state(session)
			local_manifest = json.loads((REPO / "manifest.json").read_text(encoding="utf-8"))
			print("\n# enable/reload result")
			print(json.dumps(enable_result, indent=2, ensure_ascii=False))
			print("\n# runtime state after deploy")
			print(json.dumps(state_after, indent=2, ensure_ascii=False))
			if state_after.get("loadedVersion") != local_manifest.get("version"):
				raise SystemExit(
					"Deploy wrote files, but runtime version does not match local manifest. "
					f"local={local_manifest.get('version')!r} runtime={state_after.get('loadedVersion')!r}"
				)
			if not state_after.get("apiReady"):
				raise SystemExit("Deploy wrote files, but MetaEdit API did not become ready in the iOS runtime.")
	finally:
		await inspector.close()


async def cmd_restore(lockdown: Any, args: argparse.Namespace) -> None:
	source = Path(args.backup).expanduser() if args.backup else latest_backup()
	manifest_path = source / "backup-manifest.json"
	if not manifest_path.is_file():
		raise SystemExit(f"Backup manifest not found: {manifest_path}")
	manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
	remote_plugin_dir = manifest["remotePluginDir"]
	remote_parent = remote_plugin_dir.rsplit("/", 1)[0]
	local_plugin_dir = source / PLUGIN_ID
	desired_enabled = (manifest.get("stateBeforeDeploy") or {}).get("enabled")
	expected_device_id = manifest.get("deviceId")
	current_device_id = getattr(lockdown, "udid", None) or getattr(lockdown, "identifier", None) or "usb-device"
	if expected_device_id and expected_device_id != str(current_device_id) and not args.force:
		raise SystemExit(
			"Refusing to restore a backup from a different device without --force.\n"
			f"Backup device: {expected_device_id}\n"
			f"Connected device: {current_device_id}"
		)

	afc = await afc_open(lockdown)
	try:
		if manifest.get("vaultName"):
			vault_path, _vaults = await afc_find_vault(afc, manifest["vaultName"])
			if not remote_plugin_dir.startswith(f"{vault_path}/"):
				raise SystemExit(
					"Backup vault path does not match the connected device's current vault path. "
					f"backup={remote_plugin_dir} current={vault_path}"
				)
		if await afc.exists(remote_plugin_dir):
			undeleted = await afc.rm(remote_plugin_dir, force=True)
			if undeleted:
				raise SystemExit(f"Could not remove current remote plugin dir: {undeleted}")

		if manifest.get("remotePluginDirExisted"):
			if not local_plugin_dir.is_dir():
				raise SystemExit(f"Backup plugin folder not found: {local_plugin_dir}")
			await afc.push(str(local_plugin_dir), remote_parent)
			print(f"Restored {local_plugin_dir} -> {remote_plugin_dir}")
		else:
			print(f"Removed {remote_plugin_dir}; backup recorded that no plugin dir existed before deploy.")
	finally:
		await afc.close()

	if args.no_reload:
		return

	inspector = WebinspectorService(lockdown=lockdown)
	await inspector.connect()
	try:
		async with inspector:
			_, session = await open_session(inspector)
			result = await apply_enabled_state(session, desired_enabled)
			print("# restored enabled state")
			print(json.dumps(result, indent=2, ensure_ascii=False))
	finally:
		await inspector.close()


async def cmd_reload(lockdown: Any) -> None:
	inspector = WebinspectorService(lockdown=lockdown)
	await inspector.connect()
	try:
		async with inspector:
			_, session = await open_session(inspector)
			print(json.dumps(await enable_metaedit(session), indent=2, ensure_ascii=False))
	finally:
		await inspector.close()


def read_eval_expression(args: argparse.Namespace) -> str:
	if args.file:
		return Path(args.file).read_text(encoding="utf-8")
	if args.expr:
		return args.expr
	if not sys.stdin.isatty():
		return sys.stdin.read()
	raise SystemExit("Provide an expression, --file <path>, or JavaScript on stdin.")


async def cmd_eval(lockdown: Any, args: argparse.Namespace) -> None:
	expr = read_eval_expression(args)
	inspector = WebinspectorService(lockdown=lockdown)
	await inspector.connect()
	try:
		async with inspector:
			_, session = await open_session(inspector)
			print(json.dumps(await ev(session, expr, timeout=args.timeout), indent=2, ensure_ascii=False))
	finally:
		await inspector.close()


async def cmd_logs(lockdown: Any, args: argparse.Namespace) -> None:
	inspector = WebinspectorService(lockdown=lockdown)
	await inspector.connect()
	try:
		async with inspector:
			_, session = await open_session(inspector)
			await ev(session, """((w) => {
				if (w.__metaeditMobileDebugHooked) return "already hooked";
				w.__metaeditMobileDebugHooked = true;
				w.addEventListener("error", (event) => console.error(
					"[window.onerror]",
					event.message,
					(event.filename || "") + ":" + (event.lineno || ""),
					event.error && event.error.stack || ""
				));
				w.addEventListener("unhandledrejection", (event) => console.error(
					"[unhandledrejection]",
					event.reason && (event.reason.stack || event.reason) || event.reason
				));
				return "hooked";
			})(window)""")
			await session.console_enable()
			logging.getLogger("webinspector.console").setLevel(logging.DEBUG)
			print(f"-- streaming Obsidian console/errors for {args.seconds}s --")
			await asyncio.sleep(args.seconds)
	finally:
		await inspector.close()


def cmd_backups() -> None:
	root = backup_root()
	print(f"# backup root\n{root}\n")
	if not root.exists():
		return
	for manifest in sorted(root.glob("*/*/*/backup-manifest.json"), key=lambda path: path.stat().st_mtime):
		data = json.loads(manifest.read_text(encoding="utf-8"))
		print(json.dumps({
			"path": str(manifest.parent),
			"createdAt": data.get("createdAt"),
			"remotePluginDir": data.get("remotePluginDir"),
			"remotePluginDirExisted": data.get("remotePluginDirExisted"),
			"stateBeforeDeploy": data.get("stateBeforeDeploy"),
		}, indent=2, ensure_ascii=False))


async def async_main() -> None:
	logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")

	parser = argparse.ArgumentParser()
	sub = parser.add_subparsers(dest="cmd", required=True)

	p_diag = sub.add_parser("diagnose", help="Report installed files and runtime plugin state.")
	p_diag.add_argument("--vault", default=DEFAULT_VAULT, help="AFC vault name, default: notes. Use 'auto' to auto-select.")

	p_deploy = sub.add_parser("deploy", help="Push local build artifacts to the iPhone and enable MetaEdit.")
	p_deploy.add_argument("--vault", default=DEFAULT_VAULT, help="AFC vault name, default: notes. Use 'auto' to auto-select.")
	p_deploy.add_argument("--confirm-real-vault", action="store_true", help="Required: acknowledge this writes to the real phone vault.")

	p_restore = sub.add_parser("restore", help="Restore the latest or selected pre-deploy phone plugin backup.")
	p_restore.add_argument("--backup", help="Backup directory. Defaults to the newest backup below METAEDIT_IOS_BACKUP_DIR.")
	p_restore.add_argument("--force", action="store_true", help="Allow restore when the backup device id differs from the connected device.")
	p_restore.add_argument("--no-reload", action="store_true", help="Copy files only; do not adjust runtime enabled state.")

	sub.add_parser("reload", help="Disable and enable MetaEdit in the open Obsidian iOS WebView.")

	p_eval = sub.add_parser("eval", help="Evaluate JavaScript in the Obsidian iOS WebView.")
	p_eval.add_argument("expr", nargs="?", help="JavaScript expression. Wrap statements in an async IIFE.")
	p_eval.add_argument("--file", help="Read the JavaScript expression from a file.")
	p_eval.add_argument("--timeout", type=float, default=120.0, help="Evaluation timeout in seconds.")

	p_logs = sub.add_parser("logs", help="Stream console output and uncaught errors from the Obsidian WebView.")
	p_logs.add_argument("--seconds", type=int, default=60)

	sub.add_parser("backups", help="List local backups created by deploy.")

	args = parser.parse_args()
	if args.cmd == "backups":
		cmd_backups()
		return

	lockdown = await create_using_usbmux()

	if args.cmd == "diagnose":
		await cmd_diagnose(lockdown, args)
	elif args.cmd == "deploy":
		await cmd_deploy(lockdown, args)
	elif args.cmd == "restore":
		await cmd_restore(lockdown, args)
	elif args.cmd == "reload":
		await cmd_reload(lockdown)
	elif args.cmd == "eval":
		await cmd_eval(lockdown, args)
	elif args.cmd == "logs":
		await cmd_logs(lockdown, args)


if __name__ == "__main__":
	asyncio.run(async_main())
