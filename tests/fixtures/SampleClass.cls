/**
 * Sample Apex class for testing the parser
 * Includes various Apex features to validate extraction
 */
@isTest
public with sharing class AccountHandler implements IHandler, Serializable {
    
    // Constants
    private static final String DEFAULT_INDUSTRY = 'Technology';
    public static final Integer MAX_RECORDS = 200;
    
    // Instance variables
    private List<Account> accounts;
    private Map<Id, Account> accountMap { get; set; }
    
    /**
     * Constructor
     */
    public AccountHandler() {
        this.accounts = new List<Account>();
        this.accountMap = new Map<Id, Account>();
    }
    
    /**
     * Constructor with accounts
     */
    public AccountHandler(List<Account> accounts) {
        this();
        this.accounts = accounts;
        for (Account acc : accounts) {
            this.accountMap.put(acc.Id, acc);
        }
    }
    
    /**
     * Update industry for accounts without one
     */
    public void updateIndustry(List<Account> accounts) {
        for (Account acc : accounts) {
            if (acc.Industry == null || acc.Industry == '') {
                acc.Industry = DEFAULT_INDUSTRY;
            } else if (acc.Industry == 'Unknown') {
                acc.Industry = 'Other';
            }
        }
        
        if (!accounts.isEmpty()) {
            update accounts;
        }
    }
    
    /**
     * Get accounts by industry with complex logic
     */
    public List<Account> getAccountsByIndustry(String industry, Boolean includeChildren) {
        List<Account> results;
        
        if (industry != null && industry.length() > 0) {
            if (includeChildren) {
                results = [
                    SELECT Id, Name, Industry, ParentId,
                           (SELECT Id, Name FROM Contacts)
                    FROM Account 
                    WHERE Industry = :industry
                    OR Parent.Industry = :industry
                    ORDER BY Name ASC
                    LIMIT 1000
                ];
            } else {
                results = [
                    SELECT Id, Name, Industry 
                    FROM Account 
                    WHERE Industry = :industry
                ];
            }
        } else {
            results = new List<Account>();
        }
        
        return results;
    }
    
    /**
     * Process accounts with high complexity
     */
    public Map<String, Integer> analyzeAccounts(List<Account> accounts) {
        Map<String, Integer> industryCount = new Map<String, Integer>();
        
        for (Account acc : accounts) {
            if (acc.Industry != null) {
                if (industryCount.containsKey(acc.Industry)) {
                    industryCount.put(acc.Industry, industryCount.get(acc.Industry) + 1);
                } else {
                    industryCount.put(acc.Industry, 1);
                }
                
                // Additional checks
                if (acc.AnnualRevenue != null && acc.AnnualRevenue > 1000000) {
                    if (acc.NumberOfEmployees != null && acc.NumberOfEmployees > 100) {
                        System.debug('Large enterprise: ' + acc.Name);
                    }
                }
            }
        }
        
        return industryCount;
    }
    
    /**
     * Batch insert with validation
     */
    public List<Database.SaveResult> insertAccounts(List<Account> newAccounts) {
        List<Account> validAccounts = new List<Account>();
        
        for (Account acc : newAccounts) {
            if (acc.Name != null && acc.Name.length() > 0) {
                validAccounts.add(acc);
            }
        }
        
        List<Database.SaveResult> results = Database.insert(validAccounts, false);
        
        for (Integer i = 0; i < results.size(); i++) {
            if (!results[i].isSuccess()) {
                System.debug('Error inserting: ' + validAccounts[i].Name);
            }
        }
        
        return results;
    }
    
    /**
     * Delete accounts by criteria
     */
    public void deleteInactiveAccounts() {
        List<Account> toDelete = [
            SELECT Id FROM Account 
            WHERE LastActivityDate < LAST_N_DAYS:365
            AND OwnerId = :UserInfo.getUserId()
        ];
        
        if (!toDelete.isEmpty()) {
            delete toDelete;
        }
    }
    
    /**
     * Inner class for results
     */
    public class ProcessResult {
        public Integer successCount { get; set; }
        public Integer errorCount { get; set; }
        public List<String> errors { get; set; }
        
        public ProcessResult() {
            this.successCount = 0;
            this.errorCount = 0;
            this.errors = new List<String>();
        }
    }
    
    /**
     * Inner enum for status
     */
    public enum Status {
        PENDING,
        PROCESSING,
        COMPLETED,
        FAILED
    }
}
