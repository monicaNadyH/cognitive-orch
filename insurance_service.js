

var soap = require('soap');
var Cloudant = require('cloudant');
var cloudant = Cloudant("https://6a9fedf8-8b58-4999-83cf-56c8e1d808f4-bluemix:3c1505eadd6bc2d93261a5b9b84c084766ab0836a458ed9abf1639258eb23648@6a9fedf8-8b58-4999-83cf-56c8e1d808f4-bluemix.cloudant.com");

var DATE_FORMAT = 'YYYY-MM-DD';
var moment = require('moment'); 
//var date = moment().subtract(3, 'days').format(DATE_FORMAT);
var DATE_FORMAT1 = 'MM/DD/YYYY';

var HOST_NAME = 'billing.cloudinsurer.com';
var USER = 'csr2';
var PWD = 'icd123';

const util = require('util');

const assert = require('assert');

var cfenv = require('cfenv');
var appenv = cfenv.getAppEnv();

/*var mongodb_services = services["compose-for-mongodb"];
assert(!util.isUndefined(mongodb_services), "Must be bound to compose-for-mongodb services");

var credentials = mongodb_services[0].credentials;
var ca = [new Buffer(credentials.ca_certificate_base64, 'base64')];
var mongodb;
*/

//https://billing.cloudinsurer.com/ICDService/services/BillingInquiryInterface?wsdl


var insurance_service = {
	_API: {
		base_url: 'http://'+HOST_NAME,
		billing_inquiry_endpoint: '/ICDService/services/BillingInquiryInterface?wsdl',
		payment_direct_endpoint: '/ICDService/services/PaymentInterface?wsdl'
	},
	
	_person : {
		fname : 'Natalie',
		lname : 'Smith',
		address : {
			line1 : '999 Gateway Dr',
			line2 : '',
			city : 'Dallas',
			state : 'TX',
			zip : 888888,
			country : 'US'
		},
		customer_id : 7829706
	},
	
	getPerson : function(customerId, callback) {
		callback(null, this._person);
	},
	
	getPolicyDetail(policyNum, effectiveDate, callback){
		/*if(!policyNum || policyNum.trim()==''){
			console.error('getPolicyDetail::Policy Number not provided');
			var err = new Error('Policy Number not provided');
			callback(err, null);
			return;
		}*/
		console.log('getPolicyDetail');
		console.log('policyNum = '+policyNum);
		console.log('effectiveDate = '+effectiveDate);
		
		var url = this._API.base_url + this._API.billing_inquiry_endpoint; 
		var args = JSON.parse(JSON.stringify(args0));
		
		args.inputMsg.InputRequest.PolicyNo = policyNum;
		args.inputMsg.InputRequest.PolicyEffectiveDate = effectiveDate;

		soap.createClient(url, {endpoint: 'https://billing.cloudinsurer.com/ICDService/services/BillingInquiryInterface'}, function(err, client) {
			  client.setSecurity(new soap.BasicAuthSecurity(USER, PWD));
			  client.service(args, function(err, result) {
			  		if(err){
			  			console.error('Error calling policy inquiry service', err);
			  			callback(err, null);
			  			return;
			  		}
				  	//console.log(JSON.stringify(result, null, 2));
				  	callback(null, result);
			  });
		  });			
		
		//this._getLastPaymentId(function(){return;});
	},
	
	submitPayment: function(policyNum, amount, payment_method, callback){
		console.log('submitPayment');
		var url = this._API.base_url + this._API.payment_direct_endpoint;
		var updatePaymentIdFn = this._updatePaymentId;
		
		this._getLastPaymentId(function(err, payment_id){
			if(err){
				console.log('Error getting last payment number', err);
				callback(err, null);
				return;
			}
			
			var new_payment_id = parseInt(payment_id) + 1;
			
			console.log('new SourceSystemRequestNo = ',new_payment_id);
			console.log('policy num = '+policyNum);
			
			if(payment_method.toUpperCase().includes('CREDIT')){
				payment_method = 'CREDITCARD';
			}else{
				payment_method = 'BANKACH';
			}
			
			console.log('payment method = '+payment_method);
			console.log('payment amount = '+amount);
			
			var payment_request_data = JSON.parse(JSON.stringify(args1));
			
			//set payment date TODO - remove subtract 40 days when Majesco fixes business date issue
			var current_date_str = moment().format(DATE_FORMAT);
			payment_request_data.inputMsg.PaymentDepositHeader.DepositDate = current_date_str;
			payment_request_data.inputMsg.PaymentDepositHeader.PaymentDetail.PaymentDate = current_date_str;
			payment_request_data.inputMsg.PaymentDepositHeader.PaymentDetail.PaymentPostMarkDate = current_date_str;
			payment_request_data.inputMsg.PaymentDepositHeader.PaymentDetail.PaymentReceivedDate = current_date_str;
			payment_request_data.inputMsg.RequestHeader.RequestDate = current_date_str;
			
			//set policy number
			payment_request_data.inputMsg.PaymentDepositHeader.PaymentDetail.PolicyNo = policyNum;
			
			//set source system request number
			payment_request_data.inputMsg.RequestHeader.SourceSystemRequestNo = new_payment_id+'';
			
			//set amount
			payment_request_data.inputMsg.PaymentDepositHeader.PaymentDetail.PaymentAmount = amount;
			payment_request_data.inputMsg.PaymentDepositHeader.TotalDepositAmount = amount;
			payment_request_data.inputMsg.RequestHeader.TotalPaymentAmount = amount;
			
			//set payment method
			payment_request_data.inputMsg.PaymentDepositHeader.PaymentDetail.PaymentMethod = payment_method;
			
			console.log('payment_request_data=',JSON.stringify(payment_request_data));
			
			soap.createClient(url, {endpoint: 'https://billing.cloudinsurer.com/ICDService/services/PaymentInterface'}, function(err, client) {
				  client.setSecurity(new soap.BasicAuthSecurity(USER, PWD));
				  client.service(payment_request_data, function(err, result) {
						if(err){
							console.error('Error calling Payment Direct service', err);
							callback(err, null);
							return;
						}
						if(result['return'].RequestResponse.SuccessFlag === 'SUCCESS'){
							console.log('submit payment success');
							//console.log(JSON.stringify(result, null, 2));
							console.log('updating Payment ID in Cloudant');
							//callback(null, result);
							updatePaymentIdFn(new_payment_id, function(err, data){
								if(err){
									console.error('Error updating payment source request number in cloudant', err);
									callback(err, null);
									return;
								}
								callback(null, result);
							});
								
						}else{
							console.error('Error calling Payment service', JSON.stringify(result));
							console.log('updating Payment ID in Cloudant');
							updatePaymentIdFn(new_payment_id, function(err, data){
								if(err){
									console.error('Error updating payment source request number in cloudant', err);
									callback(err, null);
									return;
								}
								var err1 = new Error('Error calling Payment service');
								callback(err1, null);
								return;
							});
							
						}
						
				  });
			  });
			
		});
	},
	
	_getLastPaymentId : function(callback){
		console.log('_getLastPaymentId');
		
		var db = cloudant.db.use('insurance-billing');
		
		db.get("payment", function(err, data) {
			
			console.log("Found payment:", data);
			if (!err){
				callback(null, data.payment_id);
			}else{
				console.log(err);
				callback(err, null);
			}
				
			/*var new_payment_id = parseInt(data.payment_id) + 1;
			data.payment_id = new_payment_id+'';
			
			console.log("Update payment id:", data);
			*/
			
			/*db.insert(data, 'payment', function(err, body) {
			  if (!err)
				console.log(body);
			  else
				console.log(err);
			});*/
			
		});
	},
	
	_updatePaymentId: function(newPaymentId, callback){
		console.log('_updatePaymentId');
		
		var db = cloudant.db.use('insurance-billing');
		/*db.insert({"payment_id": "37955249285","policyNo": "POLWR100"}, 'payment', function(err, body) {
			
		  if (!err)
			console.log(body);
		  else
			console.log(err);
		});*/
		db.get("payment", function(err, data) {
			
			console.log("Found payment:", data);
			
			newPaymentId = parseInt(newPaymentId);
			data.payment_id = newPaymentId+'';
			
			console.log("Doc with updated payment id:", data);
			
			db.insert(data, 'payment', function(err, body) {
			  if (!err){
				console.log(body);
				callback(null,body);
			  }
			  else{
				console.log(err);
				callback(err,null);
			  }
			});
		});
	}
	
}

var policy_inquiry_args = {
			NameOfInquiry: 'POLICY_INQUIRY', //POLICY_INQUIRY  POLICY_SUMMARY
			PolicyEffectiveDate: '2017-06-01',//'2017-06-06',
			PolicyNo: 'POLWR100', //'01-CA-000021319-0',
			SourceSystemRequestNo: '1'
			};
					
var args0 = {
	inputMsg: {
		InputRequest: policy_inquiry_args
	}
};

var payment_args_default = {
  
    "PaymentDepositHeader": {
      "BankAccountName": "02",
      "CurrencyCode": "USD",
      "DepositDate": moment().format(DATE_FORMAT),
      "PaymentChannel": "EBPP",
      "PaymentCount": "1",
      "PaymentDepositNo": "PI Deposit1",
      "PaymentDetail": {
        "AdditionaInformation": "Payment from  Mark",
        "PaymentAmount": "12",
        "PaymentDate": moment().format(DATE_FORMAT),
        "PaymentFrom": "INSURED",
        "PaymentId": "658475",
        "PaymentMethod": "CREDITCARD",
        "PaymentPostMarkDate": moment().format(DATE_FORMAT),
        "PaymentReceivedDate": moment().format(DATE_FORMAT),
        "PolicyNo": "POLWR100",
        "SourceSystemTransactionNo": "2363"
      },
      "SourceSystemDepositNo": "2233",
      "TotalDepositAmount": "12"
    },
    "RequestHeader": {
      "CountOfDeposits": "1",
      "CountOfRecords": "3",
      "CountOfTransactions": "1",
      "RequestDate": moment().format(DATE_FORMAT),
      "SourceSystemRequestNo": "37955249285",//"37955249285",
      "TotalPaymentAmount": "12"
    }
  
}

var args1 = {
	inputMsg: payment_args_default
};

module.exports = insurance_service;
