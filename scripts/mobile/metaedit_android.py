#!/usr/bin/env python3
"""Deploy and inspect MetaEdit in Obsidian Android over CDP.

This harness assumes an Android emulator or device is already running Obsidian.
It mirrors the safdeb/android_cdp.py pattern: forward the app WebView's
`webview_devtools_remote_<pid>` socket to localhost, then use Chrome DevTools
Protocol Runtime.evaluate.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path
from typing import Any

import websockets

PLUGIN_ID = "metaedit"
PACKAGE = "md.obsidian"
REPO = Path(__file__).resolve().parents[2]
DEFAULT_VAULT_PATH = "/sdcard/Documents/MetaEditMobile"
CDP_PORT = 9333


def adb_bin() -> str:
	return os.environ.get(
		"ADB",
		"/opt/homebrew/share/android-commandlinetools/platform-tools/adb",
	)


def run_adb(args: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
	return subprocess.run(
		[adb_bin(), *args],
		check=check,
		text=True,
		stdout=subprocess.PIPE,
		stderr=subprocess.PIPE,
	)


def adb_out(args: list[str]) -> str:
	return run_adb(args).stdout.strip()


def js(value: str) -> str:
	return json.dumps(value)


def forward_cdp(port: int = CDP_PORT) -> int:
	pid = adb_out(["shell", "pidof", PACKAGE]).split()[0]
	run_adb(["forward", f"tcp:{port}", f"localabstract:webview_devtools_remote_{pid}"])
	return int(pid)


def discover_page_ws(port: int = CDP_PORT) -> tuple[str, str]:
	data = json.load(urllib.request.urlopen(f"http://localhost:{port}/json", timeout=10))
	pages = [page for page in data if page.get("type") == "page"]
	if not pages:
		raise SystemExit(f"No CDP page target found. Targets: {[page.get('type') for page in data]}")
	page = pages[0]
	return page["webSocketDebuggerUrl"], page.get("url", "")


async def cdp_eval(expr: str, *, timeout: float = 120.0, await_promise: bool = True) -> Any:
	ws_url, _url = discover_page_ws()
	async with websockets.connect(ws_url, max_size=None, open_timeout=20) as ws:
		await ws.send(json.dumps({
			"id": 1,
			"method": "Runtime.evaluate",
			"params": {
				"expression": expr,
				"returnByValue": True,
				"awaitPromise": await_promise,
				"allowUnsafeEvalBlockedByCSP": True,
				"userGesture": True,
			},
		}))
		while True:
			response = json.loads(await asyncio.wait_for(ws.recv(), timeout))
			if response.get("id") != 1:
				continue

			result = response.get("result", {})
			if "exceptionDetails" in result:
				exception = result["exceptionDetails"]
				raise RuntimeError(exception.get("exception", {}).get("description") or json.dumps(exception))
			return result.get("result", {}).get("value")


def read_eval_expression(args: argparse.Namespace) -> str:
	if args.file:
		return Path(args.file).read_text(encoding="utf-8")
	if args.expr:
		return args.expr
	if not sys.stdin.isatty():
		return sys.stdin.read()
	raise SystemExit("Provide an expression, --file <path>, or JavaScript on stdin.")


def ensure_local_artifacts() -> dict[str, Path]:
	files = {
		"main.js": REPO / "main.js",
		"manifest.json": REPO / "manifest.json",
		"styles.css": REPO / "styles.css",
	}
	missing = [str(path) for path in files.values() if not path.is_file()]
	if missing:
		raise SystemExit(
			"Missing deploy artifact(s):\n  "
			+ "\n  ".join(missing)
			+ "\nRun `pnpm run build` before deploying to Android."
		)
	return files


async def runtime_state() -> dict[str, Any]:
	return await cdp_eval(f"""(() => {{
		const id = {js(PLUGIN_ID)};
		const plugin = app?.plugins?.plugins?.[id];
		return {{
			title: document.title,
			vaultName: app?.vault?.getName?.() ?? null,
			apiVersion: window.apiVersion ?? null,
			manifestKnown: app?.plugins?.manifests?.[id] ?? null,
			enabled: Array.from(app?.plugins?.enabledPlugins ?? []).includes(id),
			instantiated: Boolean(plugin),
			loadedVersion: plugin?.manifest?.version ?? null,
			apiReady: Boolean(plugin?.api),
			hasRunCommand: Boolean(app?.commands?.commands?.[`${{id}}:metaEditRun`]),
			body: document.body?.innerText?.slice(0, 500) ?? "",
		}};
	}})()""")


async def enable_metaedit() -> dict[str, Any]:
	return await cdp_eval(f"""(async () => {{
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


def deploy_artifacts(vault_path: str) -> None:
	files = ensure_local_artifacts()
	target = f"{vault_path.rstrip('/')}/.obsidian/plugins/{PLUGIN_ID}"
	adb_out(["shell", "mkdir", "-p", target])
	for path in files.values():
		run_adb(["push", str(path), f"{target}/"])


async def cmd_diagnose(args: argparse.Namespace) -> None:
	pid = forward_cdp(args.port)
	state = await runtime_state()
	print(json.dumps({
		"pid": pid,
		"cdpPort": args.port,
		"runtime": state,
	}, indent=2, ensure_ascii=False))


async def cmd_deploy(args: argparse.Namespace) -> None:
	if not args.confirm_scratch_vault:
		raise SystemExit(
			"Refusing to deploy without --confirm-scratch-vault. "
			"Android deploy has no backup/restore path and is intended only for disposable scratch vaults."
		)
	deploy_artifacts(args.vault_path)
	forward_cdp(args.port)
	result = await enable_metaedit()
	state = await runtime_state()
	local_manifest = json.loads((REPO / "manifest.json").read_text(encoding="utf-8"))
	print(json.dumps({
		"deployTarget": f"{args.vault_path.rstrip('/')}/.obsidian/plugins/{PLUGIN_ID}",
		"enable": result,
		"runtime": state,
	}, indent=2, ensure_ascii=False))
	if state.get("loadedVersion") != local_manifest.get("version"):
		raise SystemExit(
			"Deploy wrote files, but runtime version does not match local manifest. "
			f"local={local_manifest.get('version')!r} runtime={state.get('loadedVersion')!r}"
		)
	if not state.get("apiReady"):
		raise SystemExit("Deploy wrote files, but MetaEdit API did not become ready in Android runtime.")


async def cmd_reload(args: argparse.Namespace) -> None:
	forward_cdp(args.port)
	print(json.dumps(await enable_metaedit(), indent=2, ensure_ascii=False))


async def cmd_eval(args: argparse.Namespace) -> None:
	forward_cdp(args.port)
	expr = read_eval_expression(args)
	print(json.dumps(await cdp_eval(expr, timeout=args.timeout, await_promise=not args.no_await), indent=2, ensure_ascii=False))


async def cmd_logs(args: argparse.Namespace) -> None:
	run_adb(["logcat", "-c"])
	print(f"-- streaming Android logcat lines matching Obsidian/WebView for {args.seconds}s --")
	process = subprocess.Popen(
		[adb_bin(), "logcat", "-v", "time"],
		text=True,
		stdout=subprocess.PIPE,
		stderr=subprocess.STDOUT,
	)
	try:
		end = asyncio.get_event_loop().time() + args.seconds
		while asyncio.get_event_loop().time() < end:
			line = await asyncio.to_thread(process.stdout.readline)
			if not line:
				break
			if any(token in line.lower() for token in ("obsidian", "webview", "chromium", "fatal", "crash")):
				print(line, end="")
	finally:
		process.terminate()
		try:
			process.wait(timeout=5)
		except subprocess.TimeoutExpired:
			process.kill()


async def main() -> None:
	parser = argparse.ArgumentParser()
	sub = parser.add_subparsers(dest="cmd", required=True)

	p_diag = sub.add_parser("diagnose")
	p_diag.add_argument("--port", type=int, default=CDP_PORT)

	p_deploy = sub.add_parser("deploy")
	p_deploy.add_argument("--vault-path", default=DEFAULT_VAULT_PATH)
	p_deploy.add_argument("--port", type=int, default=CDP_PORT)
	p_deploy.add_argument(
		"--confirm-scratch-vault",
		action="store_true",
		help="Required: acknowledge Android deploy has no backup/restore path and targets a disposable scratch vault.",
	)

	p_reload = sub.add_parser("reload")
	p_reload.add_argument("--port", type=int, default=CDP_PORT)

	p_eval = sub.add_parser("eval")
	p_eval.add_argument("expr", nargs="?")
	p_eval.add_argument("--file")
	p_eval.add_argument("--timeout", type=float, default=120.0)
	p_eval.add_argument("--no-await", action="store_true")
	p_eval.add_argument("--port", type=int, default=CDP_PORT)

	p_logs = sub.add_parser("logs")
	p_logs.add_argument("--seconds", type=int, default=60)

	args = parser.parse_args()
	if args.cmd == "diagnose":
		await cmd_diagnose(args)
	elif args.cmd == "deploy":
		await cmd_deploy(args)
	elif args.cmd == "reload":
		await cmd_reload(args)
	elif args.cmd == "eval":
		await cmd_eval(args)
	elif args.cmd == "logs":
		await cmd_logs(args)


if __name__ == "__main__":
	asyncio.run(main())
