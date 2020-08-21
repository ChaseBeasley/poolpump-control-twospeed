"use strict";

const express = require("express");
const bodyParser = require("body-parser");
const SmartApp = require("@smartthings/smartapp");

const server = (module.exports = express());
server.use(bodyParser.json());

const app = new SmartApp();

/* Only here for Glitch, so that GET doesn't return an error */
server.get("/", (req, res) => {
  res.send("NodeJs SmartApp URL: https://" + req.hostname);
});

/* Handles lifecycle events from SmartThings */
server.post("/", async (req, res) => {
  app.handleHttpCallback(req, res);
});

/* Defines the SmartApp */
app
  .enableEventLogging() // Log and pretty-print all lifecycle events and responses
  .configureI18n() // Use files from locales directory for configuration page localization
  .page("mainPage", (context, page, configData) => {
  
    page.section("sectionDescriptionText", section => {
      section.paragraphSetting("descriptionText");
    });
  
    page.section("sectionTempSensor", section => {
      section
        .deviceSetting("tempSensor")
        .capabilities(["temperatureMeasurement"])
        .required(true)
        .permissions("rx");
    });
    page.section("sectionTriggerTemp", section => {
      section
        .decimalSetting("triggerTemp")
        .min(20)
        .max(44)
        .postMessage("F")
        .required(false);
    });
    page.section("sectionSwitchOnOff", section => {
      section
        .deviceSetting("switchOnOff")
        .capabilities(["switch"])
        .required(true)
        .permissions("rx");
    });
    page.section("sectionSwitchLowHigh", section => {
      section
        .deviceSetting("switchLowHigh")
        .capabilities(["switch"])
        .required(true)
        .permissions("rx");
    });
    page.section("sectionSMS", section => {
      section.textSetting("notifyContact");
      section.phoneSetting("phoneNumber").required(false);
      section
        .enumSetting("pushNotify")
        .options(["Yes", "No"])
        .required(false);
      section.textSetting("notifyText").required(false);
    });

    /* keep for now so stuff below works */
    page.section("sensors", section => {
      section.deviceSetting("sensor").capabilities(["contactSensor"]).required(true);
    });
    page.section("lights", section => {
      section.deviceSetting("lights").capabilities(["switch"]).multiple(true).permissions("rx");
    });
    /* end keep for now */

})
  .updated(async (context, updateData) => {
    await context.api.subscriptions.unsubscribeAll();
    return Promise.all([
      context.api.subscriptions.subscribeToDevices(
        context.config.sensor,
        "contactSensor",
        "contact.open",
        "openDeviceEventHandler"
      ),
      context.api.subscriptions.subscribeToDevices(
        context.config.sensor,
        "contactSensor",
        "contact.closed",
        "closedDeviceEventHandler"
      )
    ]);
  })
  .subscribedEventHandler("openDeviceEventHandler", (context, deviceEvent) => {
    return context.api.devices.sendCommands(
      context.config.lights,
      "switch",
      "on"
    );
  })
  .subscribedEventHandler(
    "closedDeviceEventHandler",
    (context, deviceEvent) => {
      return context.api.devices.sendCommands(
        context.config.lights,
        "switch",
        "off"
      );
    }
  );

/* Starts the server */
let port = process.env.PORT;
server.listen(port);
console.log(`Open: http://127.0.0.1:${port}`);

/*

definition(
    name: "Pool Control v0.3",
    namespace: "ChaseBeasley",
    author: "Charles Beasley",
    description: "Control a two speed pool pump. Requires two pump controls: an On/Off relay and a Low/High relay",
    category: "Convenience",
    iconUrl: "https://s3.amazonaws.com/smartapp-icons/Convenience/Cat-Convenience.png",
    iconX2Url: "https://s3.amazonaws.com/smartapp-icons/Convenience/Cat-Convenience@2x.png",
    iconX3Url: "https://s3.amazonaws.com/smartapp-icons/Convenience/Cat-Convenience@2x.png")

preferences {
    section("Description") {
        paragraph title: "Description", required: true, 
        "The Pool Control SmartApp (v0.3) is for people who have a pool with a two speed pump/filter system. This App can work in combination with other automations. In fact, it assumes you will use other Apps to do things like turn the pump on and off each day for a short period of time to keep the water cleen.  It is for this very reason that this App remembers the setting of the pump, and if another automation changes the pump setting while it is above the freeze setting, this SmartApp will not overide the changes initiated elsewhere. This makes this App's operation very compatible with other Apps and very intelligent."
    }
	section("Which sensor should be monitored to detect temperature?") {
        input "inputTempSens", "capability.temperatureMeasurement", required: true, multiple: true, title: "Temperature Sensor?"
    }
    section("At what temperature should the pool turn on automatically?") {
		input "inputSetTemp", "decimal", required: false, title: "Temperature? (optional, defaults to 34.5F)"
	}
	section("Which Switch is used to turn the pool pump on and off?") {
        input "inputSwitchOnOff", "capability.switch", required: true, title: "Pool Motor Switch (on/off)?"
    }
    section("Which Switch is used to switch the pool from from High to Low?") {
        input "inputSwitchLowHigh", "capability.switch", required: true, title: "Pool Motor Switch (low/high)?"
    }
	section("Via a push notification and/or an SMS message"){
		input("recipients", "contact", title: "Send notifications to") {
			input "inputPhone", "phone", title: "Enter a Phone Number to an get SMS Notification", required: false
			input "inputPush", "enum", title: "Notify me via Push Notification", required: false, options: ["Yes", "No"], defaultValue: 'No'
			}
        input "inputMessageText", "text", title: "Message to send (optional, sends standard status message if not specified)", required: false
	}
}

def installed() {
	log.debug "Installed with settings: ${settings}"
	initialize()
}

def updated() {
	log.debug "Updated with settings: ${settings}"
	// Clear out all subscriptions for this SmartApp just in case
    unsubscribe()
	// Now re-initialize this SmartApp instance
    initialize()
}

def initialize() {
    log.debug "initialize method was called"
    // Subscribe to attributes, devices, locations, etc.
    subscribe(inputTempSens, "temperature", tempNotificationHandler)
    subscribe(inputSwitchOnOff, "switch", switchDetectedHandler)
    subscribe(inputSwitchLowHigh, "switch", switchDetectedHandler)
    state.switchOnOff = "off"
    state.switchLowHigh = "off"
}


def switchDetectedHandler(evt) {
    log.debug "switchDetectedHandler method was called"    
}

// a Temperature Notification event that was subscribed to has been received.
def tempNotificationHandler(evt) {
    log.debug "tempNotificationHandler method was called"
   	def currentTemp = evt.doubleValue
    def setTemp = 34.5
    if (inputSetTemp) setTemp = inputSetTemp
    
    log.debug "The current temperature is $currentTemp degrees, setTemp is $setTemp"

    // Ignore if the value is the set temperature
    if ( currentTemp == setTemp ) {
    	log.debug "Light switch is off, so we will do nothing with the motion we detected"
	    return
    	}
        
    // First, take one set of actions if we are below the set temperature
    if ( currentTemp < setTemp ) {
    	log.debug "Temperature notification shows temp is below setting"
	    lowTempNotificationHandler(evt, currentTemp, setTemp) 
        return
    	}

    // Then, take anotther set of actions if we are above the set temperature
    if ( currentTemp > setTemp ) {
    	log.debug "Temperature notification shows temp is above setting"
	    highTempNotificationHandler(evt, currentTemp, setTemp) 
        return
    	}

}

// The Temperature Notification event shows that we are below the set temperature.
def lowTempNotificationHandler(evt, currentTemp, setTemp) {
    log.debug "lowTempNotificationHandler method was called, temperature is $currentTemp degrees"
    log.debug "inputSwitchOnOff.currentSwitch is $inputSwitchOnOff.currentSwitch, inputSwitchLowHigh.currentSwitch is $inputSwitchLowHigh.currentSwitch"
    
    // Ignore the notification if the motor is on and runnning in high mode
    if ( (inputSwitchOnOff.currentSwitch == "on") && (inputSwitchLowHigh.currentSwitch == "off") ) {
    	log.debug "Pump is cranking, so we will do nothing with this notification"
	    return
    	}

	// Send a Notification
	sendMessage(evt) 
    
	// Ensure the Pump is set to High
    if ( inputSwitchOnOff.currentSwitch == "on" ) {
    	log.debug "Turning pump to HIGH speed"
	    inputSwitchLowHigh.off()
    	}

	// Ensure the Pump is set to On
    if ( inputSwitchOnOff.currentSwitch == "off" ) {
    	log.debug "Turning pump ON"
	    inputSwitchOnOff.on()
    	}
}

// The Temperature Notification event shows that we are above the set temperature.
def highTempNotificationHandler(evt, currentTemp, setTemp) {
    log.debug "highTempNotificationHandler method was called, temperature is $currentTemp degrees"
    log.debug "inputSwitchOnOff.currentSwitch is $inputSwitchOnOff.currentSwitch, inputSwitchLowHigh.currentSwitch is $inputSwitchLowHigh.currentSwitch"
 
}

def sendMessage(evt) {
	String msg = inputMessageText
    String push = inputPush
	Map options = [:]

	if (!inputMessageText) {
		msg = "Pool Temperature Event Default Message"
		options = [translatable: true, triggerEvent: evt]
		}
    
    if (!inputPush) {
    	push = "No"
        }
    
	log.debug "$evt.name:$evt.value, pushAndPhone:$pushAndPhone, '$msg'"

	if (inputPhone) {
		options.phone = inputPhone
		if (push != "No") {
			log.debug "Sending Push and SMS"
			options.method = "both"
		} else {
			log.debug "Sending SMS only"
			options.method = "phone"
			}
	} else if (push != "No") {
		log.debug "Sending Push only"
		options.method = "push"
	} else {
		log.debug "Sending nothing"
		options.method = 'none'
	}
	sendNotification(msg, options)
}


*/
