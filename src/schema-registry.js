/**
 * Schema Registry - Manages cached Salesforce schema metadata
 * 
 * Provides lookups for SObject fields, validation rules, and relationships
 * to enrich the AST with semantic information.
 */

import fse from 'fs-extra';
import path from 'path';

const CACHE_DIR = '.asfst-cache';

/**
 * Core Sales Cloud objects that are commonly referenced
 */
const CORE_SALES_CLOUD_OBJECTS = [
  'Account',
  'Contact', 
  'Lead',
  'Opportunity',
  'Case',
  'Campaign',
  'Task',
  'Event',
  'User',
  'Product2',
  'Pricebook2',
  'PricebookEntry',
  'OpportunityLineItem',
  'Quote',
  'QuoteLineItem',
  'Contract',
  'Order',
  'OrderItem',
  'Asset',
];

/**
 * Standard field types in Salesforce
 */
const FIELD_TYPES = {
  Id: { primitive: true, description: 'Salesforce Record ID (18 chars)' },
  String: { primitive: true, description: 'Text value' },
  Boolean: { primitive: true, description: 'True/False value' },
  Integer: { primitive: true, description: 'Whole number' },
  Long: { primitive: true, description: 'Large whole number' },
  Double: { primitive: true, description: 'Decimal number' },
  Decimal: { primitive: true, description: 'Precise decimal (for currency)' },
  Date: { primitive: true, description: 'Date without time' },
  DateTime: { primitive: true, description: 'Date with time' },
  Time: { primitive: true, description: 'Time without date' },
  Blob: { primitive: true, description: 'Binary data' },
  Currency: { primitive: false, description: 'Currency amount with locale' },
  Percent: { primitive: false, description: 'Percentage value' },
  Phone: { primitive: false, description: 'Phone number' },
  Email: { primitive: false, description: 'Email address' },
  Url: { primitive: false, description: 'Web URL' },
  Picklist: { primitive: false, description: 'Single-select dropdown' },
  MultiselectPicklist: { primitive: false, description: 'Multi-select dropdown' },
  Lookup: { primitive: false, description: 'Reference to another record' },
  MasterDetail: { primitive: false, description: 'Parent-child relationship' },
  Reference: { primitive: false, description: 'Polymorphic reference' },
};

class SchemaRegistry {
  constructor() {
    this.objects = new Map();
    this.classes = new Map();
    this.triggers = new Map();
    this.loaded = false;
  }

  /**
   * Load schema from the cache directory
   */
  async loadFromCache() {
    if (this.loaded) return;
    
    const objectsDir = path.join(CACHE_DIR, 'objects');
    const classesDir = path.join(CACHE_DIR, 'classes');
    const triggersDir = path.join(CACHE_DIR, 'triggers');
    
    // Load custom objects
    if (await fse.pathExists(objectsDir)) {
      const files = await fse.readdir(objectsDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const objectData = await fse.readJson(path.join(objectsDir, file));
          const objectName = file.replace('.object.json', '').replace('.json', '');
          this.objects.set(objectName, this.parseObjectSchema(objectData, objectName));
        }
      }
    }
    
    // Load Apex classes metadata
    if (await fse.pathExists(classesDir)) {
      const files = await fse.readdir(classesDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const classData = await fse.readJson(path.join(classesDir, file));
          const className = file.replace('.cls-meta.json', '').replace('.json', '');
          this.classes.set(className, classData);
        }
      }
    }
    
    // Load trigger metadata
    if (await fse.pathExists(triggersDir)) {
      const files = await fse.readdir(triggersDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const triggerData = await fse.readJson(path.join(triggersDir, file));
          const triggerName = file.replace('.trigger-meta.json', '').replace('.json', '');
          this.triggers.set(triggerName, triggerData);
        }
      }
    }
    
    // Add standard object stubs if not in cache
    for (const obj of CORE_SALES_CLOUD_OBJECTS) {
      if (!this.objects.has(obj)) {
        this.objects.set(obj, this.createStandardObjectStub(obj));
      }
    }
    
    this.loaded = true;
  }

  /**
   * Parse object schema from cached JSON
   */
  parseObjectSchema(data, objectName) {
    const schema = {
      name: objectName,
      label: data?.CustomObject?.label || objectName,
      fields: new Map(),
      validationRules: [],
      triggers: [],
      relationships: [],
    };
    
    // Parse fields
    const fields = data?.CustomObject?.fields;
    if (fields) {
      const fieldArray = Array.isArray(fields) ? fields : [fields];
      for (const field of fieldArray) {
        if (field?.fullName) {
          schema.fields.set(field.fullName, {
            name: field.fullName,
            label: field.label || field.fullName,
            type: field.type || 'Text',
            required: field.required === 'true' || field.required === true,
            unique: field.unique === 'true' || field.unique === true,
            length: field.length ? parseInt(field.length) : null,
            referenceTo: field.referenceTo || null,
            relationshipName: field.relationshipName || null,
            picklistValues: field.valueSet?.valueSetDefinition?.value || [],
            description: field.description || null,
          });
        }
      }
    }
    
    // Parse validation rules
    const validationRules = data?.CustomObject?.validationRules;
    if (validationRules) {
      const rulesArray = Array.isArray(validationRules) ? validationRules : [validationRules];
      for (const rule of rulesArray) {
        if (rule?.fullName) {
          schema.validationRules.push({
            name: rule.fullName,
            active: rule.active === 'true' || rule.active === true,
            errorConditionFormula: rule.errorConditionFormula || '',
            errorMessage: rule.errorMessage || '',
            errorDisplayField: rule.errorDisplayField || null,
          });
        }
      }
    }
    
    return schema;
  }

  /**
   * Create a stub for standard Salesforce objects
   */
  createStandardObjectStub(objectName) {
    const standardFields = {
      Account: ['Id', 'Name', 'Industry', 'Type', 'ParentId', 'OwnerId', 'AnnualRevenue', 'NumberOfEmployees', 'BillingCity', 'BillingState', 'BillingCountry'],
      Contact: ['Id', 'FirstName', 'LastName', 'Name', 'Email', 'Phone', 'AccountId', 'OwnerId', 'MailingCity', 'MailingState'],
      Lead: ['Id', 'FirstName', 'LastName', 'Name', 'Email', 'Phone', 'Company', 'Status', 'OwnerId', 'ConvertedAccountId', 'ConvertedContactId'],
      Opportunity: ['Id', 'Name', 'Amount', 'StageName', 'CloseDate', 'AccountId', 'OwnerId', 'Probability', 'IsClosed', 'IsWon'],
      Case: ['Id', 'Subject', 'Description', 'Status', 'Priority', 'AccountId', 'ContactId', 'OwnerId', 'IsClosed'],
      Campaign: ['Id', 'Name', 'Status', 'Type', 'StartDate', 'EndDate', 'OwnerId', 'IsActive'],
      Task: ['Id', 'Subject', 'Description', 'Status', 'Priority', 'WhatId', 'WhoId', 'OwnerId', 'ActivityDate', 'IsClosed'],
      Event: ['Id', 'Subject', 'Description', 'StartDateTime', 'EndDateTime', 'WhatId', 'WhoId', 'OwnerId'],
      User: ['Id', 'Username', 'Email', 'FirstName', 'LastName', 'Name', 'IsActive', 'ProfileId', 'UserRoleId'],
      Product2: ['Id', 'Name', 'ProductCode', 'Description', 'IsActive', 'Family'],
    };
    
    const schema = {
      name: objectName,
      label: objectName,
      isStandard: true,
      fields: new Map(),
      validationRules: [],
      triggers: [],
      relationships: [],
    };
    
    const fields = standardFields[objectName] || ['Id', 'Name', 'OwnerId', 'CreatedDate', 'LastModifiedDate'];
    for (const field of fields) {
      schema.fields.set(field, {
        name: field,
        label: field,
        type: this.inferFieldType(field),
        required: field === 'Id',
        isStandard: true,
      });
    }
    
    return schema;
  }

  /**
   * Infer field type from field name
   */
  inferFieldType(fieldName) {
    if (fieldName === 'Id' || fieldName.endsWith('Id')) return 'Id';
    if (fieldName.includes('Date') || fieldName.includes('Time')) return 'DateTime';
    if (fieldName.includes('Email')) return 'Email';
    if (fieldName.includes('Phone')) return 'Phone';
    if (fieldName.includes('Amount') || fieldName.includes('Revenue') || fieldName.includes('Price')) return 'Currency';
    if (fieldName.includes('Number') || fieldName.includes('Count')) return 'Integer';
    if (fieldName.includes('Probability') || fieldName.includes('Percent')) return 'Percent';
    if (fieldName.startsWith('Is') || fieldName.startsWith('Has')) return 'Boolean';
    return 'String';
  }

  /**
   * Get object schema by name
   */
  getObject(objectName) {
    return this.objects.get(objectName);
  }

  /**
   * Get field info for an object.field reference
   */
  getField(objectName, fieldName) {
    const obj = this.objects.get(objectName);
    return obj?.fields?.get(fieldName);
  }

  /**
   * Resolve a dotted field path like 'Account.Parent.Industry'
   */
  resolveFieldPath(basePath) {
    const parts = basePath.split('.');
    if (parts.length < 2) return null;
    
    const objectName = parts[0];
    const fieldPath = parts.slice(1);
    
    let currentObject = this.objects.get(objectName);
    let resolved = [];
    
    for (let i = 0; i < fieldPath.length; i++) {
      const fieldName = fieldPath[i];
      if (!currentObject) break;
      
      const field = currentObject.fields?.get(fieldName);
      if (field) {
        resolved.push({
          object: currentObject.name,
          field: fieldName,
          type: field.type,
          info: field,
        });
        
        // If this is a relationship, follow it
        if (field.referenceTo && i < fieldPath.length - 1) {
          currentObject = this.objects.get(field.referenceTo);
        }
      }
    }
    
    return resolved.length > 0 ? resolved : null;
  }

  /**
   * Get validation rules for an object
   */
  getValidationRules(objectName) {
    const obj = this.objects.get(objectName);
    return obj?.validationRules || [];
  }

  /**
   * Check if an object is a core Sales Cloud object
   */
  isCoreObject(objectName) {
    return CORE_SALES_CLOUD_OBJECTS.includes(objectName);
  }

  /**
   * Get all loaded objects
   */
  getAllObjects() {
    return Array.from(this.objects.keys());
  }
}

// Singleton instance
const schemaRegistry = new SchemaRegistry();

export { 
  SchemaRegistry, 
  schemaRegistry, 
  CORE_SALES_CLOUD_OBJECTS,
  FIELD_TYPES,
};
