const Express = require("express");
const Server = Express();
const { stat, readFileSync, fstat, existsSync } = require(`fs`);
const { log } = require(`flaggedapi`);
const { join } = require(`path`);
Server.use(require('cookie-parser')());
Server.use(Express.json());

Server.use((req, res) => {
    let subdomain = /([\w\-\_]*)\.\w*\..*/.exec(req.hostname)?.[1];
    let rootFolder = join(__dirname, `../../../`);
    let ess = JSON.parse(readFileSync(join(rootFolder, `/src/ExpressServerSettings`, `config.json`)));
    if (ess.lockdown) { res.status(418).json({ errorTitle: `I'm stoopid :P (I'm a teapot)`, message: `All server requests are ignored due to being in Lockdown`, status: 418 }); log(`A request was stopped due to being in Lockdown, time: ${Date.now()}`, { type: `Warning` }); return;}
    const { path, query } = req;

    /**
     * ### ```responseType[type](data)```
     * The function to send data to the client.
     * 
     * ```js
     * responseType[`Error`](404, `404 Not Found`, `This does not exist`);
     * ```
     */
    const responseType = {
        /**
         * ## Error 
         * This will handle errors replies and reply to the client with the given information.
         * 
         * @param { Number } HTTP_StatusCode The HTTP Status code.
         * @param { String } [ errorTitle ] The title of the error
         * @param { String } [ description ] The description of the error
         * 
         * @returns { void }
         */
        Error: (HTTP_StatusCode, errorTitle, description) => {
            try {
                let HTTP_Status = HTTP_StatusType(errorTitle, description);
                if (HTTP_Status.page && !errorTitle) stat(HTTP_Status.payload.path, (err, status) => {
                    if (err) {
                        if(!status?.isFile()) {
                            log(`The page for Status Code ${HTTP_Status.payload.HTTP_Status} could not be found. Make sure it exist at the path in the config.\nThis could also be coming from one of the subdomains.`, { type: `error` });
                            return res.status(404).json({ errorTitle: `Missing HTTP Status Code page for HTTP Status Code: ${HTTP_Status.payload.HTTP_Status}`, description: `Wow... The ${HTTP_Status.payload.HTTP_Status} error page couldn't be found. Along with that issue, the origin HTTP Status Code is: ${HTTP_StatusCode}. Description of issue: ${HTTP_Status.payload.description ? HTTP_Status.payload.description : `NO DESCRIPTION PROVIDED`}`, HTTP_Status: 404 } );
                        } else return res.status(404).sendFile(join(__dirname, ess.errorPage));
                    } else return res.status(HTTP_StatusCode).sendFile(HTTP_Status.payload.path);
                });
                else res.status(HTTP_Status.payload.HTTP_Status).json({ errorTitle: HTTP_Status.payload.errorTitle, description: HTTP_Status.payload.description, HTTP_Status: HTTP_Status.payload.HTTP_Status }) ;
            } catch (error) {
                log(`There was an error while trying to generate a Error Response with responseType[]()`, { type: `error`});
                console.error(error);
                res.status(500).json({ errorTitle: `Unknown Internal Server Error`, description: `There was an Unknown Internal Server Error`, HTTP_Status: 500 });
            }

            /**
             * 
             * ### HTTP_StatusType(title, description)
             * 
             * @param { String } title The **Title** of the error.
             * @param { String } description The **Description** of the error.
             * 
             * @typedef { Object } HTTP_StatusInfo - The payload that is used to get information about the error.
             * @property { Boolean } page Weather there is a default page for the error or not.
             * @property { ErrorPayload } payload The information of the error.
             * 
             * @typedef { Object} ErrorPayload - The payload that comes when an error code matches a given set of codes.
             * @property { String | undefined } [ errorTitle ] The **Title** for the error, will default if not set.
             * @property { String | undefined } [ description ] The **Description** for the error, will default if not set.
             * @property { String | undefined } [ HTTP_Status ] The HTTP Status.
             * @property { String | undefined } [ path ] The path to the default error page.
             *
             * @returns { HTTP_StatusInfo }
             */
            function HTTP_StatusType(title, description) {
                let filePath = join(__dirname);
                switch (HTTP_StatusCode) {
                    case 400: return { page: false, payload: { path: undefined, errorTitle: title ? title : `HTTP Status Code 400 - Bad Request`, description: description ? description : `Common issues are an error in the URL, check your URL and try again`, HTTP_Status: 400}};
                    case 401: return { page: false, payload: { path: undefined, errorTitle: title ? title : `HTTP Status Code 401 - Unauthorized`, description: description ? description : `The request did not provide authorization information`, HTTP_Status: 401}};
                    case 403: return { page: false, payload: { path: undefined, errorTitle: title ? title : `HTTP Status Code 403 - Forbidden`, description: description ? description : `You don't have access to this resource.`, HTTP_Status: 403 } };
                    case 404: return { page: true, payload: { path: join(filePath, ess.HTTPStatusCode_404), errorTitle: title ? title : `HTTP Status Code 404 - Not Found`, description: description ? description : `The resource does not exist at this URL`, HTTP_Status: 404 }};
                    case 405: return { page: false, payload: { path: undefined, errorTitle: title ? title : `HTTP Status Code 405 - Method Not Allowed`, description: description ? description : `The method that was used was not allowed`, HTTP_Status: 405 }};
                    case 409: return { page: false, payload: { path: undefined, errorTitle: title ? title : `HTTP Status Code 409 - Conflict`, description: description ? description : `There was a conflict with the current state of the server/file`, HTTP_Status: 409 }};
                    case 418: return { page: false, payload: { path: undefined, errorTitle: title ? title : `I'm stoopid :P (I'm a Teapot)`, description: description ? description : `All server requests are ignored due to being in Lockdown`, HTTP_Status: 418 }};
                    case 500: return { page: true, payload: { path: join(filePath, ess.HTTPStatusCode_500), errorTitle: title ? title : `HTTP Status Code 500 - Internal Server Error`, description: description ? description : `The Server had an unknown internal error`, HTTP_Status: 500 }};
                    default: break;
                }
            }
        },

        /**
         * ## Success 
         * Send the file using the path to the file.
         * 
         * @param { Number } HTTP_StatusCode The HTTP Status Code.
         * @param { String } payload The path to the file or json.
         * 
         * @returns { void }
         */
        Success: (HTTP_StatusCode, payload) => {
            if (typeof payload === `string` && req.method === `GET`) return res.status(HTTP_StatusCode).sendFile(payload);
            if (req.method === `POST`) return res.status(HTTP_StatusCode).json(payload);
        }
    };

    if (req.method == `POST`) {
        if (!req.body) return responseType[`Error`](400, `No Body`, `The request did not include a body.`);
        if (!req.body.plugin) return responseType[`Error`](400, `No Plugin`, `The request did not include a plugin.`);
        if (!req.body.payload) return responseType[`Error`](400, `No Payload`, `The request did not include a payload.`);
        const plugins = readdirSync(join(rootFolder, `src/plugins`));
        if (plugins.includes(req.body.plugin + `.js`)) {
            let plugin = eval(readFileSync(join(rootFolder, `src/plugins`, req.body.plugin + `.js`), `utf-8`));
            if (!plugin.enabled) return responseType[`Error`](403, `Plugin Disabled`, `The requested plugin is disabled.`);
            plugin.run({ log, callPlugin, req }, req.body.payload).then(pluginResponse => responseType[`Success`](200, pluginResponse)).catch((Error) => {
                if (!Error?.status) {
                    log(`at ${plugin.author}.${plugin.name}`, { type: `error`});
                    console.error(Error);
                } else responseType[`Error`](Error.status, `HTTP Status ${Error.status} on Plugin: ${req.body.plugin}`, Error.message);
            });
        } else return responseType[`Error`](404, `Invalid Plugin`, `The requested plugin is not valid.`);

    } else if (req.method == `GET`) {
        stat(join(__dirname, `src/public_html`, `private.json`), (e) => {
            //TODO: Future Fix #2:  make a check to FES.database to see whether a user can access the private links.
            if (!e) privateURL = JSON.parse(readFileSync(join(__dirname, `private.json`)));
            if (!e && req.path == privateURL.find((url) => url == req.path)) return responseType[`Error`](403, `URL is Private`, `The URL is private and you don't have access to it`); //? If the file is private and someone tries to access it, it will block the client and throw a 403.
            
            //TODO: Future Fix #3: Find a better way to handle the favicon request
            if (req.path == `/favicon.ico`) { //? Browsers will make a url request for a favicon, so this allows you to decide whether you wish to give a favicon via a url request.
                //[TheFlagen430297] It is recommended to set your favicon in your HTML code.
                //[TheFlagen430297] But, you can change this in "./src/ExpressServerSettings/config.json"
                //[TheFlagen430297] If you use this method, you need to have a image file called "favicon.ico" in "./src/public_html" and in any subdomains.
                if (ess.useFaviconRequest) return stat(join(__dirname, `favicon.ico`), (Error) => Error && Error.code === `ENOENT` ? responseType[`Error`](404, `Favicon Not Found`, `Ohh okay, odd... The favicon.ico couldn't be found.`) : Error ? ( responseType[`Error`](500, `Internal Server Error`, `There was an internal server error fetching the favicon`), log(`There was a Internal Server Error while fetching the favicon.`, { type: `warning`}), console.log(Error) ) : responseType[`Success`](200, join(__dirname, `favicon.ico`))); // Checks to see if the server is using the favicon request, if so, it will check if the favicon exist, if not, it will throw a 404, if there was an error, it will handle the error, if it exist, it will send the file.
                responseType[`Error`](405, `Query Favicon Disabled`, `Querying /favicon.ico is disabled on this server`); //If the favicon request method is disabled, the server will send a 405.
            } else if (req.path == `/`) {
                    if (existsSync(join(__dirname, ess.basePage))) return responseType[`Success`](200, join(__dirname, ess.basePage)); //? Checks to see if the basePage exists.
                    responseType[`Error`](404, `Homepage Not Found`, `The homepage for the server could not be found. If you are the client (You most likely are) please try again later. If you are the server admin, make sure that settings are correct and that the file exist.`); //? The file does not exist and throws a 404.
            } else {
                let rootPath = join(__dirname);
                let hasFileExtensionRegex = /(.*)([^\w\s\/])(.*)/;
                let separator = hasFileExtensionRegex.exec(req.path)?.[2];
                if (separator && separator != `.`) return responseType[`Error`](400, `Incorrect URL Punctuation`, `The file extension separator is (${separator}), which is invalid. You must use (.) or remove the (${separator})`);
                let filePath = hasFileExtensionRegex.test(req.path) ? join(rootPath, req.path) : join(rootPath, req.path + `.html`);
                stat(filePath, (Error) => {
                    if (Error) {
                        if (separator && !hasFileExtensionRegex.exec(req.path)?.[3]) return responseType[`Error`](400, `Missing File Extension`,  `The URL ended with '.' which is invalid. You need to either provide a file extension or remove the '.'`);
                        if (Error && Error.code === "ENOENT") return responseType[`Error`](404);
                        return ( responseType[`Error`](500), console.log(Error));
                    }
                    responseType[`Success`](200, filePath);
                });
            }
        });
    } else { }
});

exports.default = Server;