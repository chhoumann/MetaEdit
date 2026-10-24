import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {Notice} from "../../tests/obsidian-stub";
import {log} from "../logger/logManager";
import {GuiLogger} from "../logger/guiLogger";
import {OnFileModifyAutomatorManager} from "./onFileModifyAutomatorManager";
import {OnModifyAutomatorType} from "./onFileModifyAutomators/onModifyAutomatorType";
import type {IOnFileModifyAutomator} from "./onFileModifyAutomators/IOnFileModifyAutomator";

const resetLoggers = () => {
    (log.constructor as unknown as {loggers: unknown[]}).loggers = [];
    Notice.messages = [];
};

const automator = (type: OnModifyAutomatorType) => ({type, onFileModify: async () => {}}) as unknown as IOnFileModifyAutomator;

describe("OnFileModifyAutomatorManager.attach", () => {
    beforeEach(() => {
        resetLoggers();
        log.register(new GuiLogger({} as never));
    });
    afterEach(resetLoggers);

    it("treats attaching an already attached automator as a no-op, without a notice", () => {
        const manager = new OnFileModifyAutomatorManager({app: {}} as never);

        manager.attach(automator(OnModifyAutomatorType.ProgressProperties));
        manager.attach(automator(OnModifyAutomatorType.KanbanHelper));
        manager.attach(automator(OnModifyAutomatorType.ProgressProperties));

        expect(Notice.messages).toEqual([]);
    });
});

describe("log.logWarning", () => {
    beforeEach(() => {
        resetLoggers();
        log.register(new GuiLogger({} as never));
    });
    afterEach(resetLoggers);

    it("reports warnings at warning level", () => {
        log.logWarning("file Board not found.");

        expect(Notice.messages).toEqual(["MetaEdit: (WARNING) file Board not found."]);
    });
});
