export type AutoPropertyType = "Single" | "Multi";

export interface AutoProperty {
    name: string,
    choices: string[],
    /** Optional, human-readable note shown in the value prompt (issue #59). */
    description?: string,
    /**
     * Selection behaviour in the value prompt (issue #40).
     * "Single" (default / undefined) lets you pick one value.
     * "Multi" lets you pick several values, written as a list.
     */
    type?: AutoPropertyType,
}
