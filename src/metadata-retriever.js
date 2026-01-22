
import { ComponentSet } from '@salesforce/source-deploy-retrieve';
import { authorize } from './auth.js';

async function retrieveMetadata(metadataTypes) {
  const connection = await authorize();

  const componentSet = new ComponentSet();

  for (const type of metadataTypes) {
    componentSet.add({
      fullName: '*',
      type: type,
    });
  }

  const retrieve = await componentSet.retrieve({
    usernameOrConnection: connection,
    output: './metadata', // This is a temporary directory
    merge: true,
  });

  const result = await retrieve.pollStatus();

  return result;
}

export { retrieveMetadata };
