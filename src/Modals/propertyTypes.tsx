import {Fragment, h} from 'preact';
import {DropdownComponent} from "obsidian";
import {useLayoutEffect, useRef} from "preact/compat";
import {ListType} from "../types/listType";
import {MetaEditSettings} from "../Settings/metaEditSettings";
import MetaEdit from "../main";

export function PropertyTypes() {
    const userSettings: MetaEditSettings = MetaEdit.getSettings();
    const propertyTypes = userSettings.PropertyTypes.userDefined;

    return (
        <Fragment>
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    width: '100%',
                    marginBottom: '1rem',
                }}
            >
                <PropertyTypeItem name="Aliases" type={userSettings.PropertyTypes.aliases} />
                <PropertyTypeItem name="CssClasses" type={userSettings.PropertyTypes.cssClasses} />
                <PropertyTypeItem name="Tags" type={userSettings.PropertyTypes.tags}/>
                {[...propertyTypes.entries()].map(([propertyKey, propertyType]) => (
                    <PropertyTypeItem name={propertyKey} type={propertyType}/>
                ))}
            </div>
        </Fragment>
    );
}

function PropertyTypeItem({name, type}: {name: string, type: ListType}) {
    const dropdownRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (dropdownRef.current) {
            const dropdown = new DropdownComponent(dropdownRef.current);
            dropdown.addOption(ListType.List.toString(), "List");
            dropdown.addOption(ListType.WhitespaceSeparated.toString(), "Whitespace");
            dropdown.addOption(ListType.CommaSeparated.toString(), "Comma");
            dropdown.addOption(ListType.SquareBracket.toString(), "Array");
            dropdown.setValue(type.toString());
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