export enum ListType {
    SquareBracket, // Supported everywhere
    /** This method is automatically handled by the YAML stringifier. */
    List, // Supported everywhere
    WhitespaceSeparated, // Not supported for aliases
    CommaSeparated, // Supported everywhere
}