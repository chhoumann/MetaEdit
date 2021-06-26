export function getTaskHeading(taskName: string, fileContent: string): string | null {
    const MARKDOWN_HEADING = new RegExp(/#+\s+(.+)/);
    const TASK_REGEX = new RegExp(/(\s*)-\s*\[([ Xx\.]?)\]\s*(.+)/, "i");

    let lastHeading: string = "";
    const contentLines = fileContent.split("\n");
    for (const line of contentLines) {
        const headingMatch = MARKDOWN_HEADING.exec(line);

        if (headingMatch) {
            const headingText = headingMatch[1];
            lastHeading = headingText;
        }

        const taskMatch = TASK_REGEX.exec(line);
        const taskContent = taskMatch[3];
        if (taskMatch && taskContent.includes(`${taskName}`)) {
            return lastHeading;
        }
    }

    return null;
}