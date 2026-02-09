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

import { NodeOperationError } from 'n8n-workflow';

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
						name: 'Row Calculation Failed',
						value: 'row.calculation.failed',
						description: 'Triggers when a row calculation fails in an AI Table',
					},
					{
						name: 'Row Created',
						value: 'row.created',
						description: 'Triggers when a new row is created in a table',
					},
 
				],
			},
			{
				displayName: 'Table Name or ID',
				name: 'phacetId',
				type: 'options',
				required: true,
				default: '',
				typeOptions: {
					loadOptionsMethod: 'getPhacets',
				},
				description:
					'Select the table (phacetId / tableId) to create a dedicated webhook endpoint for. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: {
					show: {
						event: [
							'row.calculation.completed',
							'row.calculation.failed',
							'row.created',
						],
					},
				},
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
							'row.calculation.failed',
							'row.created',
						],
					},
				},
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node') as IDataObject & {
					webhookEndpointId?: string;
					webhookUrl?: string;
					eventType?: string;
					phacetId?: string;
				};

				const webhookUrl = this.getNodeWebhookUrl('default');
				const eventType = this.getNodeParameter('event', 0) as string;
				const phacetId = this.getNodeParameter('phacetId', 0) as string;

				return (
					!!staticData.webhookEndpointId &&
					staticData.webhookUrl === webhookUrl &&
					staticData.eventType === eventType &&
					staticData.phacetId === phacetId
				);
			},

			async create(this: IHookFunctions): Promise<boolean> {

				const local = true;
				const baseUrl = local ? 'http://localhost:3001' : 'https://api.phacetlabs.com';

				const staticData = this.getWorkflowStaticData('node') as IDataObject & {
					webhookEndpointId?: string;
					webhookSecret?: string;
					webhookUrl?: string;
					eventType?: string;
					phacetId?: string;
				};

				let webhookUrl = this.getNodeWebhookUrl('default');

				if (!webhookUrl) {
					throw new NodeOperationError(this.getNode(), 'Could not determine the n8n webhook URL');
				}

				// Force a public base URL (ngrok) while preserving the n8n-generated path
				// Example: replace http://localhost:5678 with https://xxxx.ngrok-free.app
				if (local) {
					const forcedBaseUrl = 'https://subverticilate-conchologically-deedra.ngrok-free.dev';
					try {
						const originalUrl = new URL(webhookUrl);
						const forcedUrl = new URL(forcedBaseUrl);
						webhookUrl = `${forcedUrl.origin}${originalUrl.pathname}${originalUrl.search}${originalUrl.hash}`;
					} catch {
						throw new NodeOperationError(
							this.getNode(),
							`Invalid webhook URL configuration. Original: "${webhookUrl}", forced base: "${forcedBaseUrl}"`,
						);
					}
				}
				const eventType = this.getNodeParameter('event', 0) as string;
				const phacetId = this.getNodeParameter('phacetId', 0) as string;

				if (!eventType) {
					throw new NodeOperationError(this.getNode(), 'Event is required to create a webhook endpoint');
				}
				if (!phacetId) {
					throw new NodeOperationError(this.getNode(), 'Table (phacetId) is required to create a webhook endpoint');
				}

				const body = {
					url: webhookUrl,
					eventTypes: [eventType],
					tableIds: [phacetId],
					description: `n8n:${this.getWorkflow().id}:${this.getNode().name}`,
				};

				const response = (await this.helpers.httpRequestWithAuthentication.call(this, 'phacetApi', {
					method: 'POST',
					url: `${baseUrl}/api/v2/webhooks/endpoints`,
					body,
					headers: {
						accept: 'application/json',
						'content-type': 'application/json',
					},
				})) as IDataObject;

				// Response shape may vary; store best-effort identifiers
				staticData.webhookEndpointId =
					(response.endpointId as string | undefined) ??
					(response.id as string | undefined) ??
					staticData.webhookEndpointId;
				staticData.webhookSecret = (response.secret as string | undefined) ?? staticData.webhookSecret;
				staticData.webhookUrl = webhookUrl;
				staticData.eventType = eventType;
				staticData.phacetId = phacetId;

				return true;
			},

			/**
			 * We intentionally do NOT delete the remote endpoint on Phacet.
			 * On deactivation, we only clear local static data so re-activation will create a new endpoint.
			 */
			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node') as IDataObject & {
					webhookEndpointId?: string;
					webhookSecret?: string;
					webhookUrl?: string;
					eventType?: string;
					phacetId?: string;
				};

				delete staticData.webhookEndpointId;
				delete staticData.webhookSecret;
				delete staticData.webhookUrl;
				delete staticData.eventType;
				delete staticData.phacetId;

				return true;
			},
		},
	};

	methods = {
		loadOptions: {
			async getPhacets(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				// Get the 'local' parameter
				const local = true;
				const baseUrl = local ? 'http://localhost:3001' : 'https://api.phacetlabs.com';

				// Récupérer tous les projets avec leurs tables via l'API v2
				const projectsResponse = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'phacetApi',
					{
						method: 'GET',
						url: `${baseUrl}/api/v2/projects`,
						headers: {
							'accept': 'application/json',
						},
					},
				);

				const allTables: INodePropertyOptions[] = [];

				// Parcourir chaque projet et extraire ses tables
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
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const body = this.getBodyData() as IDataObject;
		const configuredEvent = this.getNodeParameter('event', 0) as string;
		const phacetId = this.getNodeParameter('phacetId', 0) as string;
		const resolveData = this.getNodeParameter('resolveData', 0) as boolean;

		// Filter by event type - ignore if not matching
		if (body.eventType !== configuredEvent) {
			return { workflowData: [] };
		}

		// Extract event data — Phacet sends { eventType, eventId, data: { ... } }
		const eventData = (body.data ?? body) as IDataObject;

		// Filter by table - ignore if phacetId is configured and doesn't match
		if (phacetId && eventData.phacetId && eventData.phacetId !== phacetId) {
			return { workflowData: [] };
		}

		const local = true;
		const baseUrl = local ? 'http://localhost:3001' : 'https://api.phacetlabs.com';

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
						url: `${baseUrl}/api/v2/tables/${phacetId}/rows/${rowId}`,
						headers: {
							'Content-Type': 'application/json',
						},
					},
				);
				outputData.row = rowData;
			} catch {
				// don't fail the trigger if it can't be fetched
			}
		}

		return {
			workflowData: [this.helpers.returnJsonArray([outputData])],
		};
	}
}
