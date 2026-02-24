# n8n-nodes-phacet-official

![Phacet Logo](https://raw.githubusercontent.com/spx-software/n8n-phacet-official/main/nodes/Phacet/phacet.svg)

This is an n8n community node for [Phacet](https://phacetlabs.com), the AI that prepares, reconciles and controls your financial data. Automate table operations; create rows, update data, retrieve results, and download files directly from your n8n workflows.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)
[Operations](#operations)
[Credentials](#credentials)
[Compatibility](#compatibility)
[Usage](#usage)
[Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

### Community Nodes (n8n Cloud & Self-hosted)

1. Go to **Settings > Community Nodes**
2. Select **Install**
3. Enter `n8n-nodes-phacet-official`
4. Select **Install**

Once installed, the Phacet node will be available in your node palette.

## Operations

This package includes **two nodes**:

- **Phacet**: manage rows in your Phacet tables
- **Phacet Trigger**: start workflows when Phacet events occur (webhooks)

### Row Operations

- **Create**: Create new rows in a table with dynamic column mapping (supports inline file upload)
- **Update**: Update an existing row with new cell values
- **Get**: Retrieve a row by its ID
- **Get Cell Download URL**: Get a temporary download URL for a file stored in a file-type column

### Trigger Operations (Phacet Trigger)

- **Row Calculation Completed** (`row.calculation.completed`)
- **Row Calculation Failed** (`row.calculation.failed`)
- **Row Created** (`row.created`)

## Credentials

You need a Phacet API key to use this node.

### Getting your Phacet API Key

1. Log in to your [Phacet account](https://app.phacetlabs.com)
2. Go to **Settings > API**
3. Generate a new API key
4. Copy the API key

### Setting up the credential in n8n

1. In n8n, create a new **Phacet API** credential
2. Enter your API key in the **API Key** field
3. Save the credential

## Compatibility

- **n8n version**: 1.0.0 or later
- **Node version**: 18.0.0 or later

## Usage

### Create Rows

Use the **Create** operation to add new rows to your Phacet tables:

1. Add the Phacet node to your workflow
2. Select **Row** as the resource
3. Select **Create** as the operation
4. Choose your **Table** from the dynamic dropdown
5. Choose your **Session** from the dynamic dropdown (based on selected table)
6. Map your data to **Cells** using the dynamic column selector (Text and/or File)
7. The node returns the created row information

For file-type columns, you can pass a file directly — no separate upload step needed.

### Update Rows

Use the **Update** operation to modify existing rows: select Row > Update, specify the Table and Row ID, then map your updated values to columns.

### Get Rows

Use the **Get** operation to retrieve a row by its ID from a specific table.

### Get Cell Download URL

Use the **Get Cell Download URL** operation to get a temporary download link for files stored in file-type columns.

### Phacet Trigger (Webhooks)

Use **Phacet Trigger** to start a workflow when Phacet emits events:

Supported events:

- **Row Calculation Completed** (`row.calculation.completed`)
- **Row Calculation Failed** (`row.calculation.failed`)
- **Row Created** (`row.created`)

1. Add **Phacet Trigger**
2. Select an **Event**
3. Select the **Table Name or ID**
4. Activate the workflow (the node creates a webhook endpoint in Phacet)

> Your n8n webhook URL must be publicly reachable by Phacet (important for self-hosted setups behind NAT/proxy).

### Dynamic Dropdowns

This node features intelligent dynamic dropdowns that:

- Load your available tables automatically
- Show sessions based on your selected table
- Display column names (not just IDs) for easy mapping
- Update in real-time as you make selections

## Example Workflows

### Invoice Processing

```
Email Trigger → Extract Attachments → Phacet Create Row (with invoice file) → Notification
```

### Bank Reconciliation

```
SFTP/HTTP → Fetch bank statements → Phacet Create Row → Wait for calculation → Get Row results
```

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
- [Phacet API Documentation](https://docs.phacetlabs.com/reference/authentication-1)
- [Phacet Platform](https://phacetlabs.com)

## License

[MIT](LICENSE.md)

---

**Developed by [Phacet Labs](https://phacetlabs.com)**
