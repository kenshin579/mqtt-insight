export namespace config {
	
	export class Profile {
	    name: string;
	    host: string;
	    port: number;
	    transport: string;
	    version: string;
	    clientId: string;
	    username: string;
	    password: string;
	    keepAlive: number;
	    cleanSession: boolean;
	    autoReconnect: boolean;
	    caCertPath: string;
	    useSystemCAs: boolean;
	    skipVerify: boolean;
	    wsPath: string;
	    willTopic: string;
	    willPayload: string;
	    willQos: number;
	    willRetained: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Profile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.transport = source["transport"];
	        this.version = source["version"];
	        this.clientId = source["clientId"];
	        this.username = source["username"];
	        this.password = source["password"];
	        this.keepAlive = source["keepAlive"];
	        this.cleanSession = source["cleanSession"];
	        this.autoReconnect = source["autoReconnect"];
	        this.caCertPath = source["caCertPath"];
	        this.useSystemCAs = source["useSystemCAs"];
	        this.skipVerify = source["skipVerify"];
	        this.wsPath = source["wsPath"];
	        this.willTopic = source["willTopic"];
	        this.willPayload = source["willPayload"];
	        this.willQos = source["willQos"];
	        this.willRetained = source["willRetained"];
	    }
	}
	export class Settings {
	    theme: string;
	    ringBufferSize: number;
	    defaultFormat: string;
	    lang: string;
	    timestampFormat: string;
	    messageOrder: string;
	    treeHintDismissed: boolean;
	    recToastShown: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.theme = source["theme"];
	        this.ringBufferSize = source["ringBufferSize"];
	        this.defaultFormat = source["defaultFormat"];
	        this.lang = source["lang"];
	        this.timestampFormat = source["timestampFormat"];
	        this.messageOrder = source["messageOrder"];
	        this.treeHintDismissed = source["treeHintDismissed"];
	        this.recToastShown = source["recToastShown"];
	    }
	}

}

export namespace mqtt {
	
	export class UserProperty {
	    key: string;
	    value: string;
	
	    static createFrom(source: any = {}) {
	        return new UserProperty(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.value = source["value"];
	    }
	}
	export class Message {
	    topic: string;
	    payload: number[];
	    qos: number;
	    retained: boolean;
	    // Go type: time
	    timestamp: any;
	    contentType?: string;
	    responseTopic?: string;
	    userProps?: UserProperty[];
	
	    static createFrom(source: any = {}) {
	        return new Message(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.topic = source["topic"];
	        this.payload = source["payload"];
	        this.qos = source["qos"];
	        this.retained = source["retained"];
	        this.timestamp = this.convertValues(source["timestamp"], null);
	        this.contentType = source["contentType"];
	        this.responseTopic = source["responseTopic"];
	        this.userProps = this.convertValues(source["userProps"], UserProperty);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

