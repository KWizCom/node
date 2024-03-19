//https://www.npmjs.com/package/@azure/storage-blob
//https://www.npmjs.com/package/@azure/storage-queue
//https://www.npmjs.com/package/@azure/storage-file-share
//https://www.npmjs.com/package/@azure/data-tables
//https://learn.microsoft.com/en-us/azure/storage/common/storage-use-azurite?tabs=visual-studio-code
import { FullOperationResponse } from "@azure/core-client";
import { ListTableEntitiesOptions, TableClient, TableServiceClient, UpdateMode, odata } from "@azure/data-tables";
import { isNullOrEmptyString, isNullOrUndefined } from "@kwiz/common";
import { IOdataFilterStatement, getOdataFilter } from "./odata";

var connectionString: string = null;
export function ConfigureTableStorage(config: { connectionString: string; }) {
    connectionString = config.connectionString;
}

function getTableService() {
    if (isNullOrEmptyString(connectionString)) throw Error("Call ConfigureTableStorage first");
    return TableServiceClient.fromConnectionString(connectionString);
}
function getTableClient(tableName: string) {
    if (isNullOrEmptyString(connectionString)) throw Error("Call ConfigureTableStorage first");
    return TableClient.fromConnectionString(connectionString, tableName);
}

interface IODataError {
    odataError: {
        code: string | "TableAlreadyExists" | "EntityAlreadyExists" | "TableNotFound" | "",
        message: {
            lang: string | "en-US",
            value: string
        }
    }
}

type TableEntityBase = {
    /**
     * The PartitionKey property of the entity.
     * Does not allow / \ # ? any control characted (like \n)
     */
    partitionKey: string;
    /**
     * The RowKey property of the entity.
     */
    rowKey: string;
}
//correctly limits the column types...
export type TableEntityType<DataType extends TableEntityBase> = {
    [P in keyof DataType]: string | boolean | Date | number;
};

export async function findTable(tableName: string) {
    const tableService = getTableService();

    let found = false;
    try {
        const tables = tableService.listTables({
            queryOptions: {
                //Tag function - read more https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals
                filter: odata`TableName eq ${tableName}`
            }
        });
        for await (const table of tables) {
            found = true;
        }
    } catch (e) {
        //console.log(e);
    }
    return found;
}

export async function listTables() {
    const tableService = getTableService();

    let arr: string[] = [];
    try {
        const tables = tableService.listTables();
        for await (const table of tables) {
            arr.push(table.name);
        }
    } catch (e) {
        //console.log(e);
    }
    return arr;
}

// async function ensureTableObsolete(name: string) {
//     const tableService = getTableService();
//     //create table
//     // If the table 'newTable' already exists, createTable doesn't throw
//     let success = false;
//     try {
//         await tableService.createTable(name, {
//             onResponse: raw => {
//                 let error = isError(raw);
//                 success = error.isError !== true;
//                 if (error.isError) console.log(error.message);
//             }
//         });
//     }
//     catch (e) {
//         success = false;
//     }

//     return success;
// }

export async function ensureTable(tableName: string) {
    const table = getTableClient(tableName);
    let success = false;
    try {
        await table.createTable({
            onResponse: raw => {
                let error = isError(raw);
                success = error.isError !== true || error.message === "TableAlreadyExists";
                //if (error.isError) console.error(error.message);
            }
        });
    } catch (e) {
        //console.error(e);
    }

    return success;
}

export async function deleteTable(tableName: string) {
    const table = getTableClient(tableName);
    let success = false;
    try {
        await table.deleteTable({
            onResponse: raw => {
                let error = isError(raw);
                success = error.isError !== true;
                //if (error.isError) console.log(error.message);
            }
        });
    } catch (e) {
        //console.log(e);
    }

    return success;
}

//https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/tables/data-tables/samples/v13/typescript/src/queryEntities.ts
export async function getItems<DataType extends TableEntityBase & TableEntityType<DataType>>(tableName: string, options?: {
    filterStatment?: IOdataFilterStatement<DataType>;
    postFilter?: (item: DataType) => boolean;
}) {
    const table = getTableClient(tableName);
    let result: DataType[] = [];
    try {
        let o: ListTableEntitiesOptions;
        if (options) {
            if (!isNullOrUndefined(options.filterStatment)) {
                let filterStatment = getOdataFilter(options.filterStatment);
                if (!isNullOrEmptyString(filterStatment))
                    o = {
                        queryOptions: {
                            filter: filterStatment
                        }
                    };
            }
        }
        let items = table.listEntities<DataType>(o);
        for await (const item of items) {
            //console.dir(item);
            if (!options || typeof options.postFilter !== "function" || options.postFilter(item))
                result.push(item as DataType);
        }
    } catch (e) {
        //console.log(e);
    }
    return result;
}

export async function addItem<DataType extends TableEntityBase & TableEntityType<DataType>>(tableName: string, item: DataType) {
    const table = getTableClient(tableName);
    let success = false;
    try {
        let result = await table.createEntity(item, {
            onResponse: raw => {
                let error = isError(raw);
                success = error.isError !== true;
                //if (error.isError) console.log(error.message);
            }
        });
        //console.log(result);
        success = true;
    } catch (e) { success = false; }
    return success;
}

export async function deleteItem(tableName: string, partitionKey: string, rowKey: string) {
    const table = getTableClient(tableName);
    let success = false;
    try {
        let result = await table.deleteEntity(partitionKey, rowKey, {
            onResponse: raw => {
                let error = isError(raw);
                success = error.isError !== true || error.message === "ResourceNotFound";
            }
        });
        //console.log(result);
        success = true;
    } catch (e) {
        //success = false;
    }
    return success;
}

export async function upsertItem<DataType extends TableEntityBase & TableEntityType<DataType>>(tableName: string, item: DataType, options?: {
    mode?: UpdateMode
}) {
    const table = getTableClient(tableName);
    let success = false;
    try {
        let result = await table.upsertEntity(item, options?.mode || "Replace", {
            onResponse: raw => {
                let error = isError(raw);
                success = error.isError !== true;
                //if (error.isError) console.log(error.message);
            }
        });
        //console.log(result);
        success = true;
    } catch (e) {
        console.error(e);
        success = false;
    }
    return success;
}

export class Table<KeysType extends TableEntityBase,
    GetKeysParam,
    SavedRow extends KeysType & TableEntityType<SavedRow>,
    ParsedRow = SavedRow>{
    private tableName: string;
    private transform: {
        save: (parsed: ParsedRow, table: Table<KeysType, GetKeysParam, SavedRow, ParsedRow>) => SavedRow;
        load: (saved: SavedRow, table: Table<KeysType, GetKeysParam, SavedRow, ParsedRow>) => ParsedRow;
    }

    public getKeys: (p: GetKeysParam) => KeysType = null;

    /** If your type contains complex values, provide a transforer to serialize/deserialize those complex columns */
    public constructor(tableName: string, options: {
        getKeys: (p: GetKeysParam) => KeysType,
        transform?: {
            save: (parsed: ParsedRow, table: Table<KeysType, GetKeysParam, SavedRow, ParsedRow>) => SavedRow;
            load: (saved: SavedRow, table: Table<KeysType, GetKeysParam, SavedRow, ParsedRow>) => ParsedRow;
        }
    }) {
        this.tableName = tableName;
        this.getKeys = options.getKeys;
        this.transform = options.transform || {
            save: v => v as any as SavedRow,
            load: v => v as any as ParsedRow
        };
    }
    public delete() {
        return deleteTable(this.tableName);
    }
    public ensure() {
        return ensureTable(this.tableName);
    }
    public async getItems(options?: {
        filterStatment?: IOdataFilterStatement<SavedRow>;
        postFilter?: (item: SavedRow) => boolean;
    }) {
        let items = await getItems<SavedRow>(this.tableName, options);
        return items.map(i => this.transform.load(i, this));
    }
    public async addItem(item: ParsedRow) {
        await this.ensure();

        return addItem<SavedRow>(this.tableName, this.transform.save(item, this));
    }
    public async upsertItem(item: ParsedRow, options?: {
        mode?: UpdateMode
    }) {
        await this.ensure();

        return upsertItem<SavedRow>(this.tableName, this.transform.save(item, this), options);
    }
    public deleteItemByKey(param: GetKeysParam) {
        let keys = this.getKeys(param);
        return this.deleteItem(keys);
    }
    public deleteItem(item: KeysType) {
        return deleteItem(this.tableName, item.partitionKey, item.rowKey);
    }
}

function isError(raw: FullOperationResponse) {
    let isError = false;
    let message: string = null;

    //201 - table created successfully
    //204 - entity created successfully
    //409 - table/entity already exists
    //400 - table name not allowed
    //404 - TableNotFound when adding item
    if (raw.status >= 400) {
        isError = true;
        let error = raw.parsedBody as IODataError;
        message = error && error.odataError && !isNullOrEmptyString(error.odataError.code)
            ? error.odataError.code
            : `Unknown error`;//for some errors like table name too short, error code is empty
    }
    else {
        isError = false;
    }

    return { isError, message };
}