#!/usr/bin/env node

const beautify = require('js-beautify/js').js,
    { Validator } = require("jsonschema"),
    axios = require("axios"),
    FormData = require("form-data"),
    xml2js = require('xml2js'),
    fs = require('fs').promises;

const methods = ["get", "post", "put", "patch", "delete", "options", "head", "trace"];

// Custom error types
class QueryValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "QueryValidationError";
    }
}

class ParamsValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "ParamsValidationError";
    }
}

class BodyValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "BodyValidationError";
    }
}

class SwaggerClientBuilder {
    /**
     * Create a new SwaggerClientBuilder
     * @param {Object} swaggerJson Swagger JSON
     * @param {Object} options Axios options
     * @returns {Function} SwaggerClientBuilder instance
     * @constructor SwaggerClientBuilder
     */
    constructor(swaggerJson, options) {
        if (!swaggerJson) throw new Error("swaggerJson is required");

        try {
            JSON.parse(JSON.stringify(swaggerJson));
        } catch (error) {
            throw new Error("swaggerJson is not valid");
        }

        this.validator = new Validator();

        // TODO: Replace _resolveRefs with this.validator.addSchema
        // TODO: Add support for securityDefinitions

        this.swaggerJson = swaggerJson;
        this.paths = swaggerJson?.paths || {};
        this.components = swaggerJson?.components?.schemas || {};
        this.definitions = swaggerJson?.definitions || {};

        this.swaggerJson = this._resolveRefs(this.swaggerJson)

        // Reassign after resolving refs
        this.definitions = this.swaggerJson?.definitions || {};
        this.components = this.swaggerJson?.components?.schemas || {};

        this.options = {};

        if (!options) options = {};

        // Set baseURL if host and basePath are present in swagger doc
        this.host = swaggerJson?.host || null;
        this.basePath = swaggerJson?.basePath || null;
        this.protocol = swaggerJson?.schemes?.[0] || "http";

        if (this.host) options.baseURL = `${this.protocol}://${this.host}${this.basePath}`;

        // Set options
        this.options = { ...options, ...this.options };

        this.instance = axios.create(this.options);

        // Build paths
        this.builtPaths = this._buildPaths();

        // Add methods
        for (const method of methods) {
            this[method] = async function (path, args) {
                if (!this?.builtPaths?.[path]?.[method]) throw new Error(`Method "${method.toUpperCase()}->${path}" not found`);
                return this.builtPaths[path][method](args);
            }
        }
    }

    _resolveRefs(obj) {
        // Recursively Loop through object keys to find $ref and resolve it
        if (typeof obj == 'object') {
            for (const key in obj) {
                if (obj[key]?.$ref) {
                    obj[key] = this._resolveRef(obj[key].$ref);
                    obj[key] = this._resolveRefs(obj[key])
                } else if (typeof obj[key] === 'object') {
                    obj[key] = this._resolveRefs(obj[key])
                }
            }
        }

        return obj
    }

    _resolveRef(ref) {
        const split = ref.split("/");

        // Get location
        let location = split[1];

        if (!["definitions", "components"].includes(location)) location = split[2];

        const componentName = split[split.length - 1];

        const component = this?.[location]?.[componentName];

        if (component) {
            return component;
        } else {
            // Not found
            return {};
        }
    }

    _prepareParameters(parameters) {
        const primeSchema = {};
        if (!parameters || typeof parameters !== 'object' || Object.keys(parameters).length == 0) return primeSchema;
        parameters.forEach((parameter) => {
            let { name, required, schema, in: at } = parameter;

            if (at) {
                if (at == 'formData') at = 'body';

                if (!primeSchema[at]) primeSchema[at] = {
                    type: "object",
                    properties: {},
                    required: [],
                };

                primeSchema[at].properties[name] = {
                    required,
                    ...schema,
                }

                if (required) primeSchema[at].required.push(name);
            }
        });

        return primeSchema;
    }

    _buildPaths() {
        try {
            const that = this;
            const { validator, paths } = this;

            const primeObject = {};

            // Loop through paths
            for (const path in paths) {
                const methods = paths[path];

                primeObject[path] = {};

                for (const methodKey in methods) {
                    const method = methods[methodKey];
                    const { parameters } = method;

                    // Convert parameters to jsonschema
                    const primeSchema = this._prepareParameters(parameters);

                    primeObject[path][methodKey] = async function (args) {
                        return new Promise(async (resolve, reject) => {
                            try {
                                let { params = {}, query = {}, body = {}, options = {} } = args;

                                const id = `${path}/${methodKey}`;

                                // Validate query
                                if (primeSchema.query) {
                                    const queryValidation = validator.validate(query, {
                                        id,
                                        ...primeSchema.query
                                    });

                                    if (queryValidation?.errors?.length > 0) throw new QueryValidationError(queryValidation.errors);
                                }

                                // Validate params
                                if (primeSchema.path) {
                                    const paramsValidation = validator.validate(params, {
                                        id,
                                        ...primeSchema.path
                                    });

                                    if (paramsValidation?.errors?.length > 0) throw new ParamsValidationError(paramsValidation.errors);
                                }

                                // Validate body
                                if (primeSchema.body) {
                                    const bodyValidation = validator.validate(body, {
                                        id,
                                        ...primeSchema.body
                                    });

                                    if (bodyValidation?.errors?.length > 0) throw new BodyValidationError(bodyValidation.errors);
                                }

                                // Replace path parameters
                                const urlPath = path.replace(/{(.*?)}/g, (m, c) => params[c]);

                                // Convert params object to query string
                                const queryString = new URLSearchParams(query).toString();

                                // Build url
                                const url = `${urlPath}${queryString ? `?${queryString}` : ""}`;

                                // Set content-type
                                let contentType = options?.headers?.['Content-Type'] || "application/json";

                                // Resolve content-type and validate body
                                if (["post", "put", "patch"].includes(methodKey)) {
                                    // requestBody content types
                                    const requestContentTypes = method?.requestBody?.content || {};
                                    const contentTypeKeys = Object.keys(requestContentTypes);

                                    // Set content-type to first content type if content type didn't match
                                    if (!contentTypeKeys.includes(contentType) && contentTypeKeys[0]) {
                                        contentType = contentTypeKeys[0];
                                    } else if (!contentTypeKeys[0]) {
                                        contentType = "application/json";
                                    }

                                    // Validate requestBody component schema
                                    const requestBodySchema = method?.requestBody?.content?.[contentType]?.schema;

                                    if (requestBodySchema) {
                                        // Validate body
                                        const bodyValidation = validator.validate(body, requestBodySchema);
                                        if (bodyValidation?.errors?.length > 0) throw new BodyValidationError(bodyValidation.errors);
                                    }

                                    // Convert body to content-type
                                    if (contentType == "multipart/form-data") {
                                        // Convert body to form data
                                        const formData = new FormData();
                                        for (const key in body) formData.append(key, body[key]);
                                        body = formData;
                                    } else if (contentType == "application/x-www-form-urlencoded") {
                                        // Convert body to url encoded
                                        body = new URLSearchParams(body).toString();
                                    } else if (contentType == "application/xml") {
                                        // Convert body to xml
                                        const builder = new xml2js.Builder();
                                        body = builder.buildObject(body);
                                    }
                                }

                                // Add content-type header
                                if (!options?.headers) options.headers = {};
                                options.headers["content-type"] = contentType;

                                // Make request
                                const response = await that.instance({
                                    method: methodKey,
                                    url,
                                    data: body,
                                    ...options,
                                });

                                resolve(response);
                            } catch (error) {
                                reject(error);
                            }
                        }
                        );
                    };

                    // Use operationId as method name if present
                    if (method?.operationId && method?.operationId != "") this[method.operationId] = primeObject[path][methodKey];
                }
            }

            return primeObject;

        } catch (error) {
            throw error;
        }
    }

    async export(filePath, options) {
        const validation = options?.validation || false;

        let addedXml2js = false;

        let str = `const axios = require("axios");\n`;

        if (validation) str += `const { Validator } = require("jsonschema");\n`;

        // Add convert url function
        str += `\nconst convertUrl = (path, params, query) => {\n`;
        str += `    const queryString = new URLSearchParams(query).toString();\n`;
        str += `    const urlPath = path.replace(/{(.*?)}/g, (m, c) => params[c]);\n`;
        str += `    const url = \`\${urlPath}\${queryString ? \`?\${queryString}\` : ""}\`;\n`;
        str += `    return url;\n`;
        str += `};\n`;

        str += `\nclass Client {\n`;
        str += `    constructor(options) {\n`;
        str += `        this.instance = axios.create(options);\n`;

        // Add validator and components
        if (validation) str += `        this.validator = new Validator();\n`;

        str += `    }\n\n`;

        // Add methods/paths to class
        for (const path in this.paths) {
            const methods = this.paths[path];
            for (const methodKey in methods) {
                const method = methods[methodKey];
                const { parameters } = method;

                let primeSchema = {};
                if (parameters && validation) primeSchema = this._prepareParameters(parameters);

                // Replace path parameters
                if (method?.operationId && method?.operationId != "") {
                    // Add jsdoc
                    str += `    /**\n`;
                    str += `     * ${method.summary}\n`;
                    str += `     * @param {Object} args\n`;
                    str += `     * @param {Object} args.params Path parameters\n`;
                    str += `     * @param {Object} args.query Query parameters\n`;
                    str += `     * @param {Object} args.body Request body\n`;
                    str += `     * @param {Object} args.options Axios request options\n`;
                    str += `     * @returns {Promise<Object>} Response\n`;
                    str += `     */\n`;
                    str += `    async ${method.operationId}(args) {\n`;
                    str += `        return new Promise(async (resolve, reject) => {\n`;
                    str += `            try {\n`;
                    str += `                const { params = {}, query = {}, body = {}, options = {} } = args;\n\n`;
                    // Add validation
                    if (validation && Object.keys(primeSchema).length > 0) {
                        str += `                const id = "/${method.operationId}";\n`;
                        // Validate query
                        if (primeSchema.query) {
                            str += `                const queryValidation = this.validator.validate(query, {\n`;
                            str += `                    id,\n`;
                            str += `                    ...${JSON.stringify(primeSchema.query, null, 2)}\n`;
                            str += `                });\n`;
                            str += `                if (queryValidation?.errors?.length > 0) throw new Error(queryValidation.errors);\n\n`;
                        }
                        // Validate params
                        if (primeSchema.path) {
                            str += `                const paramsValidation = this.validator.validate(params, {\n`;
                            str += `                    id,\n`;
                            str += `                    ...${JSON.stringify(primeSchema.path, null, 2)}\n`;
                            str += `                });\n`;
                            str += `                if (paramsValidation?.errors?.length > 0) throw new Error(paramsValidation.errors);\n\n`;
                        }
                        // Validate body
                        if (primeSchema.body) {
                            str += `                const bodyValidation = this.validator.validate(body, {\n`;
                            str += `                    id,\n`;
                            str += `                    ...${JSON.stringify(primeSchema.body, null, 2)}\n`;
                            str += `                });\n`;
                            str += `                if (bodyValidation?.errors?.length > 0) throw new Error(bodyValidation.errors);\n\n`;
                        }
                    }

                    let contentType;

                    // Validate requestBody component schema
                    if (["post", "put", "patch"].includes(methodKey)) {
                        // requestBody content types
                        const requestContentTypes = method?.requestBody?.content || {};
                        const contentTypeKeys = Object.keys(requestContentTypes);

                        // Set content-type to first content type if content type didn't match
                        if (contentTypeKeys[0]) {
                            contentType = contentTypeKeys[0];
                        } else {
                            contentType = "application/json";
                        }

                        if (validation) {
                            // Validate requestBody component schema
                            let requestBodySchema = method?.requestBody?.content?.[contentType]?.schema;

                            if (requestBodySchema) {
                                requestBodySchema = {
                                    id: `/${method.operationId}/requestBody`,
                                    ...requestBodySchema
                                }
                                // Validate body
                                str += `                const bodyValidation = this.validator.validate(body, ${JSON.stringify(requestBodySchema, null, 2)});\n`;
                                str += `                if (bodyValidation?.errors?.length > 0) throw new Error(bodyValidation.errors);\n\n`;
                            }
                        }

                        // Convert body to content-type
                        if (contentType == "multipart/form-data") {
                            // Convert body to form data
                            str += `                const FormData = require("form-data");\n`;
                            str += `                const formData = new FormData();\n`;
                            str += `                for (const key in body) formData.append(key, body[key]);\n`;
                            str += `                body = formData;\n`;
                        } else if (contentType == "application/x-www-form-urlencoded") {
                            // Convert body to url encoded
                            str += `                const URLSearchParams = require("url").URLSearchParams;\n`;
                            str += `                body = new URLSearchParams(body).toString();\n`;
                        } else if (contentType == "application/xml") {
                            // add xml2js dependency
                            if (!addedXml2js) {
                                str = `const xml2js = require('xml2js');\n` + str;
                                addedXml2js = true;
                            }
                            // Convert body to xml
                            str += `                const builder = new xml2js.Builder();\n`;
                            str += `                body = builder.buildObject(body);\n`;
                        }
                        // Add content-type header
                        str += `                if (!options?.headers) options.headers = {};\n`;
                        str += `                options.headers["content-type"] = "${contentType}";\n`;
                    }

                    // Convert params object to query string
                    str += `                const url = convertUrl("${path}", params, query);\n`;
                    str += `                const response = await this.instance({\n`;
                    str += `                    method: "${methodKey}",\n`;
                    str += `                    url,\n`;
                    str += `                    params,\n`;
                    str += `                    data: body,\n`;
                    str += `                    ...options,\n`;
                    str += `                });\n`;
                    str += `                resolve(response);\n`;
                    str += `            } catch (error) {\n`;
                    str += `                reject(error);\n`;
                    str += `            }\n`;
                    str += `        });\n`;
                    str += `    }\n`;
                }
            }
        }

        str += `}\n\n`;
        str += `module.exports = Client;`;

        // Beautify code
        const beautifiedCode = beautify(str, { indent_size: 2, space_in_empty_paren: true });

        // Write to file
        await fs.writeFile(filePath, beautifiedCode);

        return beautifiedCode;
    }
}

if (require.main === module) {
    // Run as script
    try {
        const path = require('path'), fs = require('fs'),
            { ArgumentParser } = require('argparse'),
            { version } = require('./package.json');

        const parser = new ArgumentParser({
            description: 'Swagger Client Builder',
        });

        parser.add_argument('-i', '--input', { help: 'Input swagger json file', required: true });
        parser.add_argument('-o', '--output', { help: 'Output file', required: true });
        parser.add_argument('-v', '--validation', { help: 'Add validation' });
        parser.add_argument('-V', '--version', { help: 'Show version', action: 'version', version });

        const args = parser.parse_args();

        const input = path.resolve(args.input);

        if (!fs.existsSync(input)) throw new Error(`File "${input}" not found`);

        const output = path.resolve(args.output);
        const validation = args.validation || false;

        (async () => {
            try {
                const swaggerJson = require(input);
                const builder = new SwaggerClientBuilder(swaggerJson);
                await builder.export(output, { validation });
                console.log(`Swagger client exported to ${output}`);
            } catch (error) {
                console.error(error.message);
            }
        })();
    } catch (error) {
        console.error(error.message);
    }
}

module.exports = SwaggerClientBuilder;