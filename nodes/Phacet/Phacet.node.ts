import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

import { NodeOperationError } from 'n8n-workflow';

// Use global Buffer
declare const Buffer: {
	from: (data: string | Uint8Array, encoding?: string) => Uint8Array;
	concat: (buffers: Uint8Array[]) => Uint8Array;
};

// Cell configuration interfaces
interface CellValue {
	columnId: string;
	valueType: 'text' | 'file';
	value?: string;
	fileSource?: 'upload' | 'fileId';
	binaryProperty?: string;
	originalFilename?: string;
	fileId?: string;
}

interface CellsConfig {
	cellValues: CellValue[];
}

// Helper function to upload a file to Phacet
async function uploadFile(
	context: IExecuteFunctions,
	itemIndex: number,
	binaryProperty: string,
	originalFilename?: string
): Promise<string> {
	// Get binary data
	const binaryData = context.helpers.assertBinaryData(itemIndex, binaryProperty);
	const filename = originalFilename || binaryData.fileName || 'file.pdf';

	// Validate file type (PDF only)
	if (!filename.toLowerCase().endsWith('.pdf')) {
		throw new NodeOperationError(
			context.getNode(),
			`Only PDF files are supported. File "${filename}" is not a PDF.`,
			{ itemIndex }
		);
	}

	// Get buffer data from binary data
	const binaryDataId = binaryData.id || 'data';
	const buffer = await context.helpers.getBinaryDataBuffer(itemIndex, binaryDataId);

	// Create multipart form data manually (no external dependencies)
	const boundary = `----formdata-n8n-${Math.random().toString(16)}`;
	const CRLF = '\r\n';

	// Build multipart body parts
	const parts: Uint8Array[] = [];

	// Add file part
	parts.push(Buffer.from(`--${boundary}${CRLF}`));
	parts.push(Buffer.from(`Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}`));
	parts.push(Buffer.from(`Content-Type: application/pdf${CRLF}${CRLF}`));
	parts.push(buffer);
	parts.push(Buffer.from(`${CRLF}--${boundary}--${CRLF}`));

	// Combine all parts
	const bodyBuffer = Buffer.concat(parts);

	// Upload file to Phacet
	const uploadResponse = await context.helpers.httpRequestWithAuthentication.call(
		context,
		'phacetApi',
		{
			method: 'POST',
			url: 'https://api.phacetlabs.com/api/v1/files',
			body: bodyBuffer,
			headers: {
				'Content-Type': `multipart/form-data; boundary=${boundary}`,
			},
		},
	);

	return uploadResponse.id;
}

export class Phacet implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Phacet',
		name: 'phacet',
		usableAsTool: true,
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
						description: 'Create a new row in a phacet',
						action: 'Create a row',
					},
				],
				default: 'create',
			},
			// Create Row operation fields
			{
				displayName: 'Phacet Name or ID',
				name: 'phacetId',
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
				description: 'Select the phacet where the row will be created. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
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
					loadOptionsDependsOn: ['phacetId'],
				},
				description: 'Select the session within the phacet. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
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
								displayName: 'Binary Property',
								name: 'binaryProperty',
								type: 'string',
								displayOptions: {
									show: {
										valueType: ['file'],
										fileSource: ['upload'],
									},
								},
								default: 'data',
								required: true,
								description: 'Name of the binary property containing the PDF file to upload',
							},
							{
								displayName: 'Column Name or ID',
								name: 'columnId',
								type: 'options',
								default: '',
								required: true,
								typeOptions: {
									loadOptionsMethod: 'getColumns',
									loadOptionsDependsOn: ['phacetId'],
								},
								description: 'Select the column for this cell. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
							},
							{
								displayName: 'File ID',
								name: 'fileId',
								type: 'string',
								displayOptions: {
									show: {
										valueType: ['file'],
										fileSource: ['fileId'],
									},
								},
								default: '',
								required: true,
								description: 'The ID of an already uploaded file',
							},
							{
								displayName: 'File Source',
								name: 'fileSource',
								type: 'options',
								displayOptions: {
									show: {
										valueType: ['file'],
									},
								},
								options: [
									{
										name: 'Upload File',
										value: 'upload',
										description: 'Upload a file from binary data',
									},
									{
										name: 'File ID',
										value: 'fileId',
										description: 'Use an existing file ID',
									},
								],
								default: 'upload',
								description: 'Choose how to provide the file',
							},
							{
								displayName: 'Original Filename',
								name: 'originalFilename',
								type: 'string',
								displayOptions: {
									show: {
										valueType: ['file'],
										fileSource: ['upload'],
									},
								},
								default: '',
								description: 'Original filename (optional, will use binary data filename if not provided)',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								displayOptions: {
									show: {
										valueType: ['text'],
									},
								},
								default: '',
								description: 'The text value for this cell',
							},
							{
								displayName: 'Value Type',
								name: 'valueType',
								type: 'options',
								options: [
									{
										name: 'Text',
										value: 'text',
									},
									{
										name: 'File',
										value: 'file',
									},
								],
								default: 'text',
								description: 'Type of value for this cell',
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
				const options = {
					method: 'GET' as const,
					url: 'https://api.phacetlabs.com/api/v1/phacets',
					headers: {
						'Content-Type': 'application/json',
					},
				};

				const response = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'phacetApi',
					options,
				);

				if (Array.isArray(response)) {
					return response.map((phacet: { id: string; name?: string }) => ({
						name: phacet.name || phacet.id,
						value: phacet.id,
					}));
				}

				return [];
			},

			async getSessions(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const phacetId = this.getCurrentNodeParameter('phacetId');

				if (!phacetId) {
					return [];
				}

				const options = {
					method: 'GET' as const,
					url: 'https://api.phacetlabs.com/api/v1/phacets',
					headers: {
						'Content-Type': 'application/json',
					},
				};

				const response = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'phacetApi',
					options,
				);

				if (Array.isArray(response)) {
					const selectedPhacet = response.find((phacet: { id: string; sessions?: { id: string; name?: string }[] }) => phacet.id === phacetId);

					if (selectedPhacet && Array.isArray(selectedPhacet.sessions)) {
						return selectedPhacet.sessions.map((session: { id: string; name?: string }) => ({
							name: session.name || session.id,
							value: session.id,
						}));
					}
				}

				return [];
			},

			async getColumns(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const phacetId = this.getCurrentNodeParameter('phacetId');

				if (!phacetId) {
					return [];
				}

				const options = {
					method: 'GET' as const,
					url: `https://api.phacetlabs.com/api/v1/phacets/${phacetId}`,
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
				if (resource === 'row' && operation === 'create') {
						const phacetId = this.getNodeParameter('phacetId', i) as string;
						const sessionId = this.getNodeParameter('sessionId', i) as string;
						const cells = this.getNodeParameter('cells', i) as CellsConfig;

						// Validate inputs
						if (!phacetId) {
							throw new NodeOperationError(this.getNode(), 'Phacet ID is required', { itemIndex: i });
						}
						if (!sessionId) {
							throw new NodeOperationError(this.getNode(), 'Session ID is required', { itemIndex: i });
						}
						if (!cells.cellValues || cells.cellValues.length === 0) {
							throw new NodeOperationError(this.getNode(), 'At least one cell is required', { itemIndex: i });
						}

						// Process cells
						const processedCells: Array<{ columnId: string; value: string }> = [];

						for (const cell of cells.cellValues) {
							if (cell.valueType === 'file') {
								if (cell.fileSource === 'fileId') {
									// Use existing file ID
									processedCells.push({
										columnId: cell.columnId,
										value: cell.fileId || '',
									});
								} else {
									// Upload file and get ID
									try {
										const fileId = await uploadFile(
											this,
											i,
											cell.binaryProperty!,
											cell.originalFilename
										);
										processedCells.push({
											columnId: cell.columnId,
											value: fileId,
										});
									} catch (error) {
										throw new NodeOperationError(
											this.getNode(),
											`Failed to upload file for cell: ${error.message}`,
											{ itemIndex: i }
										);
									}
								}
							} else {
								// Text value
								processedCells.push({
									columnId: cell.columnId,
									value: cell.value || '',
								});
							}
						}

						// Prepare the request body
						const requestBody = {
							sessionId,
							cells: processedCells,
						};

						// Make the API call
						const responseData = await this.helpers.httpRequestWithAuthentication.call(
							this,
							'phacetApi',
							{
								method: 'POST',
								url: `https://api.phacetlabs.com/api/v1/phacets/${phacetId}/rows`,
								body: requestBody,
								headers: {
									'Content-Type': 'application/json',
								},
							},
						);

						// Return the response data
						const result = {
							...responseData,
						};

						returnData.push({
							json: result,
							pairedItem: { item: i },
						});
					}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: error.message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}