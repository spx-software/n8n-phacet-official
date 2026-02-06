import type {
	IDataObject,
	IHookFunctions,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
	ILoadOptionsFunctions,
} from 'n8n-workflow';

export class PhacetTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Phacet Trigger',
		usableAsTool: true,
		name: 'phacetTrigger',
		icon: 'file:phacet.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description: 'Starts the workflow when Phacet events occur',
		defaults: {
			name: 'Phacet Trigger',
		},
		inputs: [],
		outputs: ['main'],
		credentials: [
			{
				name: 'phacetApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				required: true,
				default: 'row.calculation.completed',
				options: [
					{
						name: 'Row Calculation Completed',
						value: 'row.calculation.completed',
						description: 'Triggers when a row calculation completes successfully in an AI Table',
					},
					{
						name: 'Row Calculation Started',
						value: 'row.calculation.started',
						description: 'Triggers when a row calculation starts in an AI Table',
					},
					{
						name: 'Row Created',
						value: 'row.created',
						description: 'Triggers when a new row is created in a table',
					},
					{
						name: 'Table Created',
						value: 'phacet.created',
						description: 'Triggers when a new table is created',
					},
				],
			},
			{
				displayName: 'Table Name or ID',
				name: 'phacetId',
				type: 'options',
				default: '',
				typeOptions: {
					loadOptionsMethod: 'getPhacets',
				},
				description:
					'Filter events for a specific table. Leave empty to receive events from all tables. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Resolve Data',
				name: 'resolveData',
				type: 'boolean',
				default: true,
				description:
					'Whether to automatically fetch the full row data when a row event is received. Requires a table to be selected.',
				displayOptions: {
					show: {
						event: [
							'row.calculation.completed',
							'row.calculation.started',
							'row.created',
						],
					},
				},
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
		},
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				return !!webhookData.endpointId;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				let webhookUrl = this.getNodeWebhookUrl('default') as string;

				// Replace localhost with public domain for testing (Phacet API rejects localhost URLs)
				webhookUrl = webhookUrl.replace(/http:\/\/localhost:\d+/, 'https://api.phacetlabs.com');

				const event = this.getNodeParameter('event') as string;
				const phacetId = this.getNodeParameter('phacetId', '') as string;

				const body: IDataObject = {
					url: webhookUrl,
					eventTypes: [event],
					description: `n8n trigger for ${event}`,
				};

				if (phacetId) {
					body.phacetIds = [phacetId];
				}

				const response = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'phacetApi',
					{
						method: 'POST',
						url: 'https://api.phacetlabs.com/api/v2/webhooks/endpoints',
						body,
						headers: {
							'Content-Type': 'application/json',
						},
					},
				);

				const webhookData = this.getWorkflowStaticData('node');
				webhookData.endpointId = response.endpointId;
				webhookData.secret = response.secret;

				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				const endpointId = webhookData.endpointId as string;

				if (endpointId) {
					try {
						await this.helpers.httpRequestWithAuthentication.call(
							this,
							'phacetApi',
							{
								method: 'DELETE',
								url: `https://api.phacetlabs.com/api/v2/webhooks/endpoints/${endpointId}`,
								headers: {
									'Content-Type': 'application/json',
								},
							},
						);
					} catch {
						// Ignore deletion errors — endpoint may already be removed
					}
				}

				delete webhookData.endpointId;
				delete webhookData.secret;

				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const body = this.getBodyData() as IDataObject;
		const phacetId = this.getNodeParameter('phacetId', 0) as string;
		const resolveData = this.getNodeParameter('resolveData', 0) as boolean;

		// Extract event data — Phacet sends { eventType, eventId, data: { ... } }
		const eventData = (body.data ?? body) as IDataObject;

		const outputData: IDataObject = {
			eventType: body.eventType,
			eventId: body.eventId,
			...eventData,
		};

		// Include phacetId from config (useful since some events don't include it)
		if (phacetId) {
			outputData.phacetId = phacetId;
		}

		// Automatically fetch the full row data when possible
		const rowId = eventData.rowId as string | undefined;

		if (resolveData && rowId && phacetId) {
			try {
				const rowData = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'phacetApi',
					{
						method: 'GET',
						url: `https://api.phacetlabs.com/api/v2/tables/${phacetId}/rows/${rowId}`,
						headers: {
							'Content-Type': 'application/json',
						},
					},
				);
				outputData.row = rowData;
			} catch {
				// Row data is a bonus — don't fail the trigger if it can't be fetched
			}
		}

		return {
			workflowData: [this.helpers.returnJsonArray([outputData])],
		};
	}
}
