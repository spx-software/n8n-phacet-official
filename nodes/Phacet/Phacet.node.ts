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

export class Phacet implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Phacet',
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
						name: 'File',
						value: 'file',
					},
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
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['file'],
					},
				},
				options: [
					{
						name: 'Upload',
						value: 'upload',
						description: 'Upload a PDF file to Phacet',
						action: 'Upload a file',
					},
				],
				default: 'upload',
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
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								description: 'The cell value. For text columns: enter text. For file columns: use the file ID returned by the Upload File operation (e.g., "{{$node["Upload File"].JSON["ID"]}}")',
								placeholder: 'Text value or file ID from previous Upload File node',
							},
						],
					},
				],
			},
			// Upload File operation fields
			{
				displayName: 'Input Binary Field',
				name: 'binaryProperty',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['file'],
						operation: ['upload'],
					},
				},
				default: 'data',
				required: true,
				description: 'Name of the binary property containing the PDF file to upload',
			},
			{
				displayName: 'Original Filename',
				name: 'originalFilename',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['file'],
						operation: ['upload'],
					},
				},
				default: '',
				description: 'Original filename (optional, will use binary data filename if not provided)',
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
				if (resource === 'file') {
					if (operation === 'upload') {
						const binaryProperty = this.getNodeParameter('binaryProperty', i) as string;
						const originalFilename = this.getNodeParameter('originalFilename', i) as string;

						// Get binary data
						const binaryData = this.helpers.assertBinaryData(i, binaryProperty);
						const filename = originalFilename || binaryData.fileName || 'file.pdf';

						// Validate file type (PDF only)
						if (!filename.toLowerCase().endsWith('.pdf')) {
							throw new NodeOperationError(
								this.getNode(),
								`Only PDF files are supported. File "${filename}" is not a PDF.`,
								{ itemIndex: i }
							);
						}

						// Get buffer data from binary data
						const binaryDataId = binaryData.id || 'data';
						const buffer = await this.helpers.getBinaryDataBuffer(i, binaryDataId);

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
						const uploadResponse = await this.helpers.httpRequestWithAuthentication.call(
							this,
							'phacetApi',
							{
								method: 'POST',
								url: 'https://api.phacetlabs.com/api/v1/files',
								body: bodyBuffer,
								headers: {
									'Content-Type': `multipart/form-data; boundary=${boundary}`,
								},
								// encoding: null removed as it's not a valid option
							},
						);

						returnData.push({
							json: {
								id: uploadResponse.id,
								filename: filename,
								originalFilename: filename,
								...uploadResponse,
							},
							pairedItem: { item: i },
						});
					}
				} else if (resource === 'row') {
					if (operation === 'create') {
						const phacetId = this.getNodeParameter('phacetId', i) as string;
						const sessionId = this.getNodeParameter('sessionId', i) as string;
						const cells = this.getNodeParameter('cells', i) as {
							cellValues: Array<{
								columnId: string;
								value?: string;
							}>;
						};

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
							// All cells are now treated as text values (including file IDs)
							processedCells.push({
								columnId: cell.columnId,
								value: cell.value || '',
							});
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