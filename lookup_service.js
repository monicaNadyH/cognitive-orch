var numeral = require('numeral');
//numeral(transaction_response.total_amount_received).format('$0,0.00');

var moment = require('moment'); 

var insurance_service = require('./insurance_service');
var simulated_data = require('./simulated_data');

var DATE_FORMAT = 'YYYY-MM-DD';

var lookup_service = {
		
		_lookupKeys: {
			LOOKUP_INVESTMENTS: 'investments',
			LOOKUP_BALANCE: 'balance',
			SUBMIT_PAYMENT: 'payment'
		},
		/**
		*
		* Looks for actions requested by conversation service
		*
		**/
		checkForLookupRequests: function (data, callback){
			console.log('checkForLookupRequests');
			//console.log('data = ',JSON.stringify(data,null,2));
		
			if(data.context.action.lookup && data.context.action.lookup === this._lookupKeys.LOOKUP_BALANCE){
				console.log('Lookup policy balance requested');
				data.context.action.lookup = 'complete';
				
				var policy_number = data.context.policyNum || '';
			 	var policy_effective_date = data.context.policyEffectiveDate || '';
			 	var simulated_mode = data.context.simulatedMode || '';
			 	
			 	console.log('checkForLookupRequests :: simulated_mode = ',simulated_mode);
			 	
			 	if(simulated_mode == 'true' || simulated_mode == true){
			 		console.log('returning simulated policy data');
			 		data.context['session'] = { 'BillingInquirySummary': JSON.parse(JSON.stringify(simulated_data.BillingInquirySummary)) };
			 		
			 		//add simulated session payments (if any)
			 		var simulated_payment_transactions = data.context['simulated_payment_transactions'] || [];
			 		console.log('simulated_payment_transactions=',simulated_payment_transactions);
			 		if(simulated_payment_transactions.length > 0){
			 			data.context['session'].BillingInquirySummary.BillingInquiryTransactions.unshift(simulated_payment_transactions[0]);	
			 			console.log('simulated_payment_transactions added ',data.context['session']);
			 		}
			 		
 
			 		
			 		//subtract payment from policy balance
			 		var payment = (data.context['simulated_payment_transactions'] && data.context['simulated_payment_transactions'].length>0) ? 
			 				data.context['simulated_payment_transactions'][0].TransactionAmount : 0;
			 		
			 		data.context['session'].BillingInquirySummary.BillingInquiryInvoiceDetail[0].Balance = 
			 			  data.context['session'].BillingInquirySummary.BillingInquiryInvoiceDetail[0].Balance*1 + 
			 			  payment*1;
			 		
			 		//clear simulated payment transaction from session to avoid duplicate deductions
			 		if(simulated_payment_transactions.length > 0){
			 			data.context['simulated_payment_transactions'] = [];	
			 		}
			 			  
			 		callback(null, data);
			 		return;
			 	}
			 	
				insurance_service.getPolicyDetail(policy_number, policy_effective_date, function(err, result){
					data.context['session'] = {
						'BillingInquirySummary': result['return'].BillingInquirySummary[0]?result['return'].BillingInquirySummary[0]:{}
						
					};
					//console.log('Logging context :: '+JSON.stringify(data.context,null,2));
					callback(null, data);
					return;
				});
			
			}else if(data.context.action.submit && data.context.action.submit === this._lookupKeys.SUBMIT_PAYMENT){
				console.log('Submit payment requested');
				data.context.action.submit = 'complete';
				
				var policy_number = data.context.policyNum || '';
				var amount = data.context.new_payment_amount || '';
				var payment_method = data.context.new_payment_method || ''; 
				var simulated_mode = data.context.simulatedMode || '';
				
				console.log('checkForLookupRequests :: simulated_mode',simulated_mode);
				console.log('new_payment_amount = '+amount);
				console.log('new_payment_method = '+payment_method);
				
				if(simulated_mode == 'true' || simulated_mode == true){
			 		console.log('checkForLookupRequests :: simulated_mode = true');
			 		var current_date_str = moment().format(DATE_FORMAT);
			 		var temp_new_payment = {
						"PolicyEffectiveDate" : null,
						"PolicyNo" : policy_number,
						"TransactionAmount" : -1*amount+'',
						"TransactionDate" : current_date_str,
						"TransactionEffDate" : current_date_str,
						"TransactionType" : "Payment"
					};
			 		data.context['simulated_payment_transactions'] = [];
			 		data.context['simulated_payment_transactions'].push(temp_new_payment);
			 		
			 		callback(null, data);
			 		return;
			 	}
				
				insurance_service.submitPayment(policy_number, amount, payment_method, function(err, result){
					/*data.context['session'] = {
						'BillingInquirySummary': result['return'].BillingInquirySummary[0]?result['return'].BillingInquirySummary[0]:{}
						
					};*/
					
					//console.log('Logging context :: '+JSON.stringify(data.context,null,2));
					if(err){
						console.log('error processing payment', err);
						callback(err, null);
						return;
					}
					callback(null, data);
					return;
				});
				
			}
			else if(data.context.action.lookup &&  data.context.action.lookup === this._lookupKeys.LOOKUP_INVESTMENTS){
			console.log('Lookup investments requested');
			
			var categories = [];
			data.entities.forEach(function(entity){
				if(entity.entity==='investment_type'){
					switch (entity.value) {
						case 'equity': 
							categories.push('Equity');
							break;
						case 'fixed income': 
							categories.push('Fixed Income');
							break;
						default: 
					}
			
				}
			});
			
			console.log('data = ',JSON.stringify(data,null,2));
			
			data.context.action.lookup = 'complete';
			
			var investments = [];
			var total = 0;
			var customerPosition = data.context.customerPosition || null;
							
			//use API summary data from context for investment data
			if(customerPosition){
				var banks =  customerPosition.bankAccounts;
				banks.forEach(function(bank){
					if(bank.accounts){
						bank.accounts.forEach(function(account){
							if(account.type && 
								account.type.toUpperCase().includes('INVEST')){
									if(account.investments){
										account.investments.forEach(function(investment){
											
											if(categories.length>0){
												if(categories.includes(investment.assetType)){
													investments.push(investment);
													total += investment.marketValue.amount;
												}
											}else{
												investments.push(investment);
												total += investment.marketValue.amount;
											}
											
											
										});
									}
								
							}
						});
					}
					
				});
				
			
			} 
			
			data.context.action['result'] = {
					'investment': {
									'investments': investments,
									'total': numeral(total).format('$0,0.00')
								}
									
					};
			callback(null, data);
			return;
		}else {
			callback(null, data);
			return;
		}
		
	}

}

module.exports = lookup_service;
