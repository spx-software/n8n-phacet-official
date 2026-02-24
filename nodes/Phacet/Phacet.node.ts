import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

import { NodeOperationError } from 'n8n-workflow';

declare const Buffer: {
	from: (data: string | Uint8Array, encoding?: string) => Uint8Array;
	concat: (buffers: Uint8Array[]) => Uint8Array;
};

const uploadFile = async function (
	this: IExecuteFunctions,
	itemIndex: number,
	binaryPropertyName: string,
	originalFilename?: string,
): Promise<{ id: string; filename: string }> {
	const binaryData = this.helpers.assertBinaryData(itemIndex, binaryPropertyName);
	const filename = originalFilename || binaryData.fileName || 'file.pdf';

	if (!filename.toLowerCase().endsWith('.pdf')) {
		throw new NodeOperationError(
			this.getNode(),
			`Only PDF files are supported. File "${filename}" is not a PDF.`,
			{ itemIndex },
		);
	}

	const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);

	const boundary = `----formdata-n8n-${Math.random().toString(16)}`;
	const CRLF = '\r\n';

	const parts: Uint8Array[] = [];

	parts.push(Buffer.from(`--${boundary}${CRLF}`));
	parts.push(Buffer.from(`Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}`));
	parts.push(Buffer.from(`Content-Type: application/pdf${CRLF}${CRLF}`));
	parts.push(buffer);
	parts.push(Buffer.from(`${CRLF}--${boundary}--${CRLF}`));

	const bodyBuffer = Buffer.concat(parts);

	const uploadResponse = await this.helpers.httpRequestWithAuthentication.call(
		this,
		'phacetApi',
		{
			method: 'POST',
			url: 'https://api.phacetlabs.com/api/v2/files',
			body: bodyBuffer,
			headers: {
				'Content-Type': `multipart/form-data; boundary=${boundary}`,
			},
		},
	);

	return { id: uploadResponse.id, filename };
};

export class Phacet implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Phacet',
		usableAsTool: true,
		name: 'phacet',
		icon: 'file:phacet.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Interact with Phacet API to manage spreadsheet data',
		defaults: {
			name: 'Phacet',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'phacetApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Row',
						value: 'row',
					},
				],
				default: 'row',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['row'],
					},
				},
				options: [
					{
						name: 'Create',
						value: 'create',
						description: 'Create a new row in a table',
						action: 'Create a row',
					},
					{
						name: 'Update',
						value: 'update',
						description: 'Updates an existing row in a specific table with new cell values',
						action: 'Update a row',
					},
					{
						name: 'Get',
						value: 'get',
						description: 'Retrieve a row by its ID from a specific table',
						action: 'Get a row',
					},
					{
						name: 'Get Cell Download URL',
						value: 'getCellDownloadUrl',
						description: 'Gets a temporary download URL for a file stored in a file-type column',
						action: 'Get a cell download URL',
					},
				],
				default: 'create',
			},
			{
				displayName: 'Table Name or ID',
				name: 'tableId',
				type: 'options',
				required: true,
				displayOptions: {
					show: {
						resource: ['row'],
						operation: ['create'],
					},
				},
				default: '',
				typeOptions: {
					loadOptionsMethod: 'getPhacets',
				},
				description: 'Select the table where the row will be created. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Session Name or ID',
				name: 'sessionId',
				type: 'options',
				required: true,
				displayOptions: {
					show: {
						resource: ['row'],
						operation: ['create'],
					},
				},
				default: '',
				typeOptions: {
					loadOptionsMethod: 'getSessions',
					loadOptionsDependsOn: ['tableId'],
				},
				description: 'Select the session within the table. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Cells',
				name: 'cells',
				type: 'fixedCollection',
				displayOptions: {
					show: {
						resource: ['row'],
						operation: ['create'],
					},
				},
				default: {},
				description: 'The cell data for the new row',
				placeholder: 'Add Cell',
				typeOptions: {
					multipleValues: true,
				},
				options: [
					{
						name: 'cellValues',
						displayName: 'Cell',
						values: [
							{
								displayName: 'Column Name or ID',
								name: 'columnId',
								type: 'options',
								default: '',
								required: true,
								typeOptions: {
									loadOptionsMethod: 'getColumns',
									loadOptionsDependsOn: ['tableId'],
								},
								description: 'Select the column for this cell. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
							},
							{
								displayName: 'Input Binary Field',
								name: 'binaryProperty',
								type: 'string',
								default: 'data',
								displayOptions: {
									show: {
										type: ['file'],
									},
								},
								description: 'Name of the binary property containing the PDF file',
							},
							{
								displayName: 'Original Filename',
								name: 'originalFilename',
								type: 'string',
								default: '',
								displayOptions: {
									show: {
										type: ['file'],
									},
								},
								description: 'Original filename (optional, will use binary data filename if not provided)',
							},
							{
								displayName: 'Type',
								name: 'type',
								type: 'options',
								options: [
									{ name: 'Text', value: 'text' },
									{ name: 'File', value: 'file' },
								],
								default: 'text',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								displayOptions: {
									show: {
										type: ['text'],
									},
								},
								description: 'The cell value. For text columns: enter text.',
								placeholder: 'Text value',
							},
						],
					},
				],
			},
			{
				displayName: 'Table Name or ID',
				name: 'tableId',
				type: 'options',
				required: true,
				displayOptions: {
					show: {
						resource: ['row'],
						operation: ['get', 'update', 'getCellDownloadUrl'],
					},
				},
				default: '',
				typeOptions: {
					loadOptionsMethod: 'getPhacets',
				},
				description: 'Select the table where the row will be retrieved. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Row ID',
				name: 'rowId',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['row'],
						operation: ['get', 'update'],
					},
				},
				default: '',
				description: 'ID of the row to retrieve',
			},
			{
				displayName: 'Cell ID',
				name: 'cellId',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						resource: ['row'],
						operation: ['getCellDownloadUrl'],
					},
				},
				default: '',
				description: 'ID of the cell containing the file. You can get cell IDs from the response of a "Get Row" operation.',
			},
			{
				displayName: 'Cells',
				name: 'cells',
				type: 'fixedCollection',
				displayOptions: {
					show: {
						resource: ['row'],
						operation: ['update'],
					},
				},
				default: {},
				description: 'The cell data for the new row',
				placeholder: 'Add Cell',
				typeOptions: {
					multipleValues: true,
				},
				options: [
					{
						name: 'cellValues',
						displayName: 'Cell',
						values: [
							{
								displayName: 'Column Name or ID',
								name: 'columnId',
								type: 'options',
								default: '',
								required: true,
								typeOptions: {
									loadOptionsMethod: 'getColumns',
									loadOptionsDependsOn: ['tableId'],
								},
								description: 'Select the column for this cell. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
							},
							{
								displayName: 'Input Binary Field',
								name: 'binaryProperty',
								type: 'string',
								default: 'data',
								displayOptions: {
									show: {
										type: ['file'],
									},
								},
								description: 'Name of the binary property containing the PDF file',
							},
							{
								displayName: 'Original Filename',
								name: 'originalFilename',
								type: 'string',
								default: '',
								displayOptions: {
									show: {
										type: ['file'],
									},
								},
								description: 'Original filename (optional, will use binary data filename if not provided)',
							},
							{
								displayName: 'Type',
								name: 'type',
								type: 'options',
								options: [
									{ name: 'Text', value: 'text' },
									{ name: 'File', value: 'file' },
								],
								default: 'text',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								displayOptions: {
									show: {
										type: ['text'],
									},
								},
								description: 'The cell value. For text columns: enter text.',
								placeholder: 'Text value',
							},
						],
					},
				],
			},
					],
	};

	methods = {
		loadOptions: {
			async getPhacets(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const projectsResponse = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'phacetApi',
					{
						method: 'GET',
						url: 'https://api.phacetlabs.com/api/v2/projects',
						headers: {
							'accept': 'application/json',
						},
					},
				);

				const allTables: INodePropertyOptions[] = [];

				if (Array.isArray(projectsResponse)) {
					projectsResponse.forEach((project: { id: string; name: string; tables: Array<{ id: string; name: string }> }) => {
						if (project.tables && Array.isArray(project.tables)) {
							project.tables.forEach((table) => {
								allTables.push({
									name: table.name,
									value: table.id,
								});
							});
						}
					});
				}

				return allTables.sort((a: INodePropertyOptions, b: INodePropertyOptions) => a.name.localeCompare(b.name));
			},

			async getSessions(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const tableId = this.getCurrentNodeParameter('tableId');

				if (!tableId) {
					return [];
				}

				const projectsResponse = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'phacetApi',
					{
						method: 'GET',
						url: 'https://api.phacetlabs.com/api/v2/projects',
						headers: {
							'accept': 'application/json',
						},
					},
				);

				if (Array.isArray(projectsResponse)) {
					for (const project of projectsResponse) {
						if (project.tables && Array.isArray(project.tables)) {
							const selectedTable = project.tables.find((table: { id: string; sessions?: Array<{ id: string; name?: string }> }) => table.id === tableId);

							if (selectedTable && Array.isArray(selectedTable.sessions)) {
								return selectedTable.sessions.map((session: { id: string; name?: string }) => ({
									name: session.name || session.id,
									value: session.id,
								})).sort((a: INodePropertyOptions, b: INodePropertyOptions) => a.name.localeCompare(b.name));
							}
						}
					}
				}

				return [];
			},

			async getColumns(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const tableId = this.getCurrentNodeParameter('tableId');

				if (!tableId) {
					return [];
				}

				const options = {
					method: 'GET' as const,
					url: `https://api.phacetlabs.com/api/v2/tables/${tableId}`,
					headers: {
						'Content-Type': 'application/json',
					},
				};

				const response = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'phacetApi',
					options,
				);

				if (response && Array.isArray(response.columns)) {
					return response.columns.map((column: { id: string; columnName?: string }) => ({
						name: column.columnName || column.id,
						value: column.id,
					}));
				}

				return [];
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				if (resource === 'row') {
					if (operation === 'create') {
						const tableId = this.getNodeParameter('tableId', i) as string;
						const sessionId = this.getNodeParameter('sessionId', i) as string;
						const cells = this.getNodeParameter('cells', i) as {
							cellValues: Array<{
								columnId: string;
								value?: string;
								type?: 'text' | 'file';
								binaryProperty?: string;
								originalFilename?: string;
							}>;
						};

						if (!tableId) {
							throw new NodeOperationError(this.getNode(), 'Table ID is required', { itemIndex: i });
						}
						if (!sessionId) {
							throw new NodeOperationError(this.getNode(), 'Session ID is required', { itemIndex: i });
						}
						if (!cells.cellValues || cells.cellValues.length === 0) {
							throw new NodeOperationError(this.getNode(), 'At least one cell is required', { itemIndex: i });
						}

						const processedCells: Array<{ columnId: string; value: string }> = [];

						for (const cell of cells.cellValues) {
							if (cell.type === 'file') {
								if (!cell.binaryProperty) {
									throw new NodeOperationError(
										this.getNode(),
										'Binary property is required for file cells',
										{ itemIndex: i },
									);
								}
								const { id: fileId } = await uploadFile.call(
									this,
									i,
									cell.binaryProperty,
									cell.originalFilename,
								);
								processedCells.push({
									columnId: cell.columnId,
									value: fileId,
								});
							} else {
								processedCells.push({
									columnId: cell.columnId,
									value: cell.value || '',
								});
							}
						}

						const requestBody = {
							sessionId,
							cells: processedCells,
						};

						const responseData = await this.helpers.httpRequestWithAuthentication.call(
							this,
							'phacetApi',
							{
								method: 'POST',
								url: `https://api.phacetlabs.com/api/v2/tables/${tableId}/rows`,
								body: requestBody,
								headers: {
									'Content-Type': 'application/json',
								},
							},
						);

						const result = {
							...responseData,
						};

						returnData.push({
							json: result,
							pairedItem: { item: i },
						});
					} else if (operation === 'update') {
						const tableId = this.getNodeParameter('tableId', i) as string;
						const rowId = this.getNodeParameter('rowId', i) as string;
						const cells = this.getNodeParameter('cells', i) as {
							cellValues: Array<{
								columnId: string;
								value?: string;
								type?: 'text' | 'file';
								binaryProperty?: string;
								originalFilename?: string;
							}>;
						};

						if (!tableId) {
							throw new NodeOperationError(this.getNode(), 'Table ID is required', { itemIndex: i });
						}
						if (!rowId) {
							throw new NodeOperationError(this.getNode(), 'Row ID is required', { itemIndex: i });
						}
						if (!cells.cellValues || cells.cellValues.length === 0) {
							throw new NodeOperationError(this.getNode(), 'At least one cell is required', { itemIndex: i });
						}

						const processedCells: Array<{ columnId: string; value: string }> = [];

						for (const cell of cells.cellValues) {
							if (cell.type === 'file') {
								if (!cell.binaryProperty) {
									throw new NodeOperationError(
										this.getNode(),
										'Binary property is required for file cells',
										{ itemIndex: i },
									);
								}
								const { id: fileId } = await uploadFile.call(
									this,
									i,
									cell.binaryProperty,
									cell.originalFilename,
								);
								processedCells.push({
									columnId: cell.columnId,
									value: fileId,
								});
							} else {
								processedCells.push({
									columnId: cell.columnId,
									value: cell.value || '',
								});
							}
						}

						const requestBody = {
							cells: processedCells,
						};

						const responseData = await this.helpers.httpRequestWithAuthentication.call(
							this,
							'phacetApi',
							{
								method: 'PUT',
								url: `https://api.phacetlabs.com/api/v2/tables/${tableId}/rows/${rowId}`,
								body: requestBody,
								headers: {
									'Content-Type': 'application/json',
								},
							},
						);

						const result = {
							...responseData,
						};

						returnData.push({
							json: result,
							pairedItem: { item: i },
						});
					} else if (operation === 'getCellDownloadUrl') {
						const tableId = this.getNodeParameter('tableId', i) as string;
						const cellId = this.getNodeParameter('cellId', i) as string;

						if (!tableId) {
							throw new NodeOperationError(this.getNode(), 'Table ID is required', { itemIndex: i });
						}
						if (!cellId) {
							throw new NodeOperationError(this.getNode(), 'Cell ID is required', { itemIndex: i });
						}

						const response = await this.helpers.httpRequestWithAuthentication.call(
							this,
							'phacetApi',
							{
								method: 'GET',
								url: `https://api.phacetlabs.com/api/v2/tables/${tableId}/cells/${cellId}/download-file-url`,
							},
						);	

						returnData.push({
							json: response,
							pairedItem: { item: i },
						});
					} else if (operation === 'get') {
						const tableId = this.getNodeParameter('tableId', i) as string;
						const rowId = this.getNodeParameter('rowId', i) as string;

						if (!tableId) {
							throw new NodeOperationError(this.getNode(), 'Table ID is required', { itemIndex: i });
						}
						if (!rowId) {
							throw new NodeOperationError(this.getNode(), 'Row ID is required', { itemIndex: i });
						}

						const response = await this.helpers.httpRequestWithAuthentication.call(
							this,
							'phacetApi',
							{
								method: 'GET',
								url: `https://api.phacetlabs.com/api/v2/tables/${tableId}/rows/${rowId}`,
							},
						);

						returnData.push({
							json: response,
							pairedItem: { item: i },
						});
					}
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message } });
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
