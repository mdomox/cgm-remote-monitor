'use strict';

var _ = require('lodash');
var moment = require('moment');
var languageCode = 'en';

function configure (app, wares, ctx, env) {
    var express = require('express');
    var api = express.Router();
    var entries = ctx.entries;
    var translate = ctx.language.translate;

    // invoke common middleware
    api.use(wares.sendJSONStatus);
    // text body types get handled as raw buffer stream
    api.use(wares.bodyParser.raw());
    // json body types get handled as parsed json
    api.use(wares.bodyParser.json());

    ctx.plugins.eachEnabledPlugin(function each(plugin) {
      if (plugin.googleHome) {
        if (plugin.googleHome.intentHandlers) {
          console.log('Plugin ' + plugin.name + ' is Google Home enabled');
          _.each(plugin.googleHome.intentHandlers, function (handler) {
            if (handler) {
              ctx.googleHome.configureIntentHandler(handler.intent, handler.intentHandler, handler.routableSlot, handler.slots);
            }
          });
        }
      } else {
        console.log('Plugin ' + plugin.name + ' is not Google Home enabled');
      }
    });
    
    api.post('/googlehome', ctx.authorization.isPermitted('api:*:read'), function (req, res, next) {
      console.log('Incoming request from Google Home');
        onIntent(req.body, function (response) {
        res.json(ctx.googleHome.buildResponse(response));
        next();
      });
    });

    ctx.googleHome.configureIntentHandler('CurrentMetric', function (result, next, sbx) {
      entries.list({count: 1}, function(err, records) {
        var response = '';
        if (records && records.length > 0) {
          var direction = '';
          if (records[0].direction === 'FortyFiveDown') {
            direction = translate(' and slightly dropping');
          } else if (records[0].direction === 'FortyFiveUp') {
            direction = translate(' and slightly rising');
          } else if (records[0].direction === 'Flat') {
            direction = translate(' and holding');
          } else if (records[0].direction === 'SingleUp') {
            direction = translate(' and rising');
          } else if (records[0].direction === 'SingleDown') {
            direction = translate(' and dropping');
          } else if (records[0].direction === 'DoubleDown') {
            direction = translate(' and rapidly dropping');
          } else if (records[0].direction === 'DoubleUp') {
            direction = translate(' and rapidly rising');
          }
          response = buildPreamble(result.parameters);
          response += sbx.scaleMgdl(records[0].sgv) + direction + translate(' as of ') + translate(moment(records[0].date).from(moment(sbx.time)));
        } else {
          response = buildPreamble(result.parameters) + 'unknown';
        }
        next(response);
      });
    }, 'metric', ['bg', 'blood glucose', 'blood sugar', 'number']);

    

    function buildPreamble(parameters) {
      var preamble = '';
      if (parameters && parameters.givenName) {
        preamble = parameters.givenName + '\'s current ';
      } else {
        preamble = 'Your current ';
      }
      if (parameters && parameters.readingType) {
        preamble += parameters.readingType + ' is ';
      } else {
        preamble += 'blood glucose is ';
      }
      return preamble;
    }

    function onIntent(body, next) {
      console.log('Received intent request');
      console.log(JSON.stringify(body));
      handleIntent(body, next);
    }

    // https://docs.api.ai/docs/webhook#section-format-of-request-to-the-service
    function handleIntent(body, next) {
      var displayName = body.queryResult.intent.displayName;
      var metric = body.queryResult.parameters ? body.queryResult.parameters.metric : null;
        var locale = body.queryResult.intent.languageCode;
        if(locale){
            if(locale.length > 2) {
                locale = locale.substr(0, 2);
            }
            ctx.language.set(locale);
            moment.locale(locale);
        }
      var handler = ctx.googleHome.getIntentHandler(displayName, metric, locale);
      if (handler) {
        var sbx = initializeSandbox();
        handler(body.queryResult, next, sbx);
      } else {
        next('I\'m sorry I don\'t know what you\'re asking for');
      }
    }

    function initializeSandbox() {
      var sbx = require('../../sandbox')();
      sbx.serverInit(env, ctx);
      ctx.plugins.setProperties(sbx);
      return sbx;
    }

    return api;
}

module.exports = configure;
