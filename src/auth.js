
import { AuthInfo, Connection } from '@salesforce/core';

async function authorize() {
  try {
    // This will use the default org set in the Salesforce CLI
    const authInfo = await AuthInfo.create();
    const connection = await Connection.create({ authInfo });
    console.log('Successfully connected to Salesforce org:', connection.getAuthInfo().getFields().orgId);
    return connection;
  } catch (error) {
    console.error('Salesforce authentication failed:', error.message);
    process.exit(1);
  }
}

export { authorize };
