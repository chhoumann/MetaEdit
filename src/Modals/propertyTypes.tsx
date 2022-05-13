import {Fragment, h} from 'preact';
import {Component, DropdownComponent, MarkdownRenderer} from "obsidian";
import {useLayoutEffect, useRef} from "preact/compat";
import {ListType} from "../types/listType";

export function PropertyTypes() {
    const listExample = useRef<HTMLDivElement>(null);
    const whitespaceExample = useRef<HTMLDivElement>(null);
    const commaExample = useRef<HTMLDivElement>(null);
    const arrayExample = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (listExample.current) {
            MarkdownRenderer.renderMarkdown(
                "aliases:\n  - item1\n  - item 2\n  - item 3\n",
                listExample.current,
                "",
                new Component()
            );
        }

        if (whitespaceExample.current) {
            MarkdownRenderer.renderMarkdown(
                "tags: atomic published/blog",
                whitespaceExample.current,
                "",
                new Component()
            );
        }

        if (commaExample.current) {
            MarkdownRenderer.renderMarkdown(
                "key: 1, 2, 3, 4",
                commaExample.current,
                "",
                new Component()
            );
        }

        if (arrayExample.current) {
            MarkdownRenderer.renderMarkdown(
                "key: [1, 2, 3, 4]",
                arrayExample.current,
                "",
                new Component()
            );
        }
    }, []);

    return (
        <Fragment>
            <h3>Property Types</h3>
            <div
                style={{
                    display: "flex",
                    flexDirection: "row",
                    flexWrap: "wrap",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "1rem"
                }}
            >
                <div ref={listExample} />
                <div ref={whitespaceExample} />
                <div ref={commaExample} />
                <div ref={arrayExample} />
            </div>

            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    width: '100%',
                    marginBottom: '1rem',
                }}
            >
                <PropertyTypeItem name="Aliases" />
                <PropertyTypeItem name="CssClasses" />
                <PropertyTypeItem name="Tags" />
            </div>
        </Fragment>
    );
}

function PropertyTypeItem({name}: {name: string}) {
    const dropdownRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (dropdownRef.current) {
            const dropdown = new DropdownComponent(dropdownRef.current);
            dropdown.addOption(ListType.List.toString(), "List");
            dropdown.addOption(ListType.WhitespaceSeparated.toString(), "Whitespace");
            dropdown.addOption(ListType.CommaSeparated.toString(), "Comma");
            dropdown.addOption(ListType.SquareBracket.toString(), "Array");
        }
    }, []);

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "0.5rem",
            }}
        >
            <span>{name}</span>
            <div ref={dropdownRef} />
        </div>
    )
}