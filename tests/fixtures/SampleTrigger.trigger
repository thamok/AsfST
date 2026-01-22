/**
 * Sample trigger for testing the parser
 */
trigger AccountTrigger on Account (before insert, before update, after insert, after update, before delete) {
    
    if (Trigger.isBefore) {
        if (Trigger.isInsert || Trigger.isUpdate) {
            for (Account acc : Trigger.new) {
                if (acc.Industry == null) {
                    acc.Industry = 'Technology';
                }
                
                if (acc.Name != null && acc.Name.length() > 100) {
                    acc.addError('Name cannot exceed 100 characters');
                }
            }
        }
        
        if (Trigger.isDelete) {
            for (Account acc : Trigger.old) {
                if (acc.AnnualRevenue > 1000000) {
                    acc.addError('Cannot delete high-value accounts');
                }
            }
        }
    }
    
    if (Trigger.isAfter) {
        if (Trigger.isInsert) {
            List<Task> tasks = new List<Task>();
            
            for (Account acc : Trigger.new) {
                tasks.add(new Task(
                    Subject = 'Welcome Call',
                    WhatId = acc.Id,
                    OwnerId = acc.OwnerId
                ));
            }
            
            insert tasks;
        }
        
        if (Trigger.isUpdate) {
            Set<Id> changedAccounts = new Set<Id>();
            
            for (Account acc : Trigger.new) {
                Account oldAcc = Trigger.oldMap.get(acc.Id);
                if (acc.Industry != oldAcc.Industry || acc.Name != oldAcc.Name) {
                    changedAccounts.add(acc.Id);
                }
            }
            
            if (!changedAccounts.isEmpty()) {
                List<Contact> contacts = [
                    SELECT Id, AccountId, MailingCity 
                    FROM Contact 
                    WHERE AccountId IN :changedAccounts
                ];
                
                // Update related contacts if needed
                update contacts;
            }
        }
    }
}
