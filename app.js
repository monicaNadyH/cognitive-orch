/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
 * 
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 * 
 * http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */


'use strict';

require('dotenv').config({
	silent : true
});

var express = require('express'); // app server
var bodyParser = require('body-parser'); // parser for post requests
var watson = require('watson-developer-cloud'); // watson sdk
// cfenv provides access to your Cloud Foundry environment
// for more info, see: https://www.npmjs.com/package/cfenv
var cfenv = require('cfenv');

var vcapServices = require('vcap_services');

var url = require('url'),  
	http = require('http'), 
	https = require('https'),
	extend = require('util')._extend;
	
	

var insurance_service = require('./insurance_service');
var lookup_service = require('./lookup_service');

var CONVERSATION_USERNAME = '55da7f28-952c-4627-8d3f-3838cf665f34',
	CONVERSATION_PASSWORD = 'RfvvX7nFwF80';

var WORKSPACE_ID = '215a27af-29ca-4cb8-8cfb-4a91641d76fb';//'ed9151e3-cdc8-4214-98f1-ad19e01e7714';


var app = express();

// Bootstrap application settings
app.use(express.static('./public')); // load UI from public folder
app.use(bodyParser.json());

app.all('/*', function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, X-Requested-With");
  next();
});

//credentials
var conversation_credentials = vcapServices.getCredentials('conversation');

// Create the service wrapper
var conversation = watson.conversation({
	url : 'https://gateway.watsonplatform.net/conversation/api',
	username : conversation_credentials.username || CONVERSATION_USERNAME,
	password : conversation_credentials.password || CONVERSATION_PASSWORD,
	version_date : '2017-02-03',
	version : 'v1'
});



// Endpoint to be called from the client side
app.post('/api/message', function(req, res) {
	var workspace = process.env.WORKSPACE_ID || WORKSPACE_ID;
	
	if ( !workspace || workspace === '<workspace-id>' ) {
		return res.json( {
		  'output': {
			'text': 'Your app is running but it is yet to be configured with a <b>WORKSPACE_ID_COMMERCIAL</b> environment variable. '
			}
		} );
	}
	
	var personID = '7829707'; //default
	var customerID = '7829706'; //default
	var policyNum = 'POLWR100'; //default
	var policyEffectiveDate = '2017-06-01'; //default
	var simulatedMode = 'false'; //default 
	
	if(req.body){
		if(req.body.personID && req.body.personID != null) 
			personID = req.body.personID;  
		
		if(req.body.customerID && req.body.customerID != null)
			customerID = req.body.customerID;
			
		if(req.body.policyNum && req.body.policyNum != '')
			policyNum = req.body.policyNum;
			
		if(req.body.policyEffectiveDate && req.body.policyEffectiveDate != '')
			policyEffectiveDate = req.body.policyEffectiveDate;
		
		if(req.body.simulatedMode && req.body.simulatedMode != '')
			simulatedMode = req.body.simulatedMode;
	}
	
	insurance_service.getPerson(customerID, function(err, person){
		
		if(err){
			console.log('Error occurred while getting person data ::', err);
			return res.status(err.code || 500).json(err);
		}
		
		var payload = {
			workspace_id : workspace,
			context : {
				'person' : person
			},
			input : {}
		};

		if (req.body) {
			if (req.body.input) {
				payload.input = req.body.input;
			}
			if (req.body.context) {
				// must maintain context/state
				payload.context = req.body.context;
				
				if(!payload.context.person){
					payload.context.person = person;
				}
				//clear display actions from context
				if(payload.context.action && payload.context.action.display){
					payload.context.action.display = {};
				}
				if(payload.context.action && payload.context.action.display_templates){
					payload.context.action.display_templates = {};
				}
				
				//policy number
				if(!payload.context.policyNum){
					payload.context.policyNum = policyNum;
				}
				
				//effective date
				if(!payload.context.policyEffectiveDate){
					payload.context.policyEffectiveDate = policyEffectiveDate;
				}
				
				//simulated mode
				if(!payload.context.simulatedMode){
					payload.context.simulatedMode = simulatedMode;
				}

			}

		}
		console.log('payload=',JSON.stringify(payload));
		callconversation(payload);
	
	});
	

	// Send the input to the conversation service
	function callconversation(payload) {
		var query_input = JSON.stringify(payload.input);
		var context_input = JSON.stringify(payload.context);

		conversation.message(payload, function(err, data) {
			if (err) {
				return res.status(err.code || 500).json(err);
			}else{
				console.log('conversation.message :: ',JSON.stringify(data));
				
				if(data.context && data.context.action && ((data.context.action.lookup && data.context.action.lookup!= 'complete') 
					|| (data.context.action.submit && data.context.action.submit != 'complete') )){
					//lookup actions 
					lookup_service.checkForLookupRequests(data, function(err, data){
						if (err) {
							return res.status(err.code || 500).json(err);
						}else{
							console.log('lookup complete');
							console.log('calling conversation again wth data = ',
											JSON.stringify(data));
							
							var workspace = process.env.WORKSPACE_ID || WORKSPACE_ID;
							var new_payload = {
								workspace_id : workspace,
								context : data.context,
								input : data.input
							}
							
							conversation.message(new_payload, function(err, data) {
								if (err) {
									return res.status(err.code || 500).json(err);
								}else{
									console.log('conversation.message after lookup:: ',JSON.stringify(data));
									return res.json(data);
									
								}
							});
						
						}
					});
				
				}else{
					return res.json(data);
				}
			}
		});
		
	}

});




module.exports = app;
