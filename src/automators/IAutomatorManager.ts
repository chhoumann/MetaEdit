import type {IOnFileModifyAutomator} from "./onFileModifyAutomators/IOnFileModifyAutomator";
import type {OnModifyAutomatorType} from "./onFileModifyAutomators/onModifyAutomatorType";

export interface IAutomatorManager {
    attach(automator: IOnFileModifyAutomator): IAutomatorManager;
    detach(automatorType: OnModifyAutomatorType): IAutomatorManager;
    startAutomators(): IAutomatorManager;
}