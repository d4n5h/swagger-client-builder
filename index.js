#!/usr/bin/env node

const beautify = require('js-beautify/js').js,
    { Validator } = require("jsonschema"),
    axios = require("axios"),
    FormData = require("form-data"),
    xml2js = require('xml2js'),
    fs = require('fs').promises,
    SwaggerParser = require('swagger-parser'),
    { URLSearchParams } = require('url'),
    chalk = require('chalk');

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
    constructor(swaggerFile, options) {
        this.swaggerFile = swaggerFile;
        this.paths = {};
        this.components = {};
        this.definitions = {};
        this.options = options || {};
        this.api = {}
        this.validator = null;
        this.instance = null;
        this.builtPaths = {};
    }

    async build() {
        try {
            const api = await SwaggerParser.validate(this.swaggerFile, {
                dereference: {
                    circular: false,
                }
            });

            this.validator = new Validator();

            this.api = api;
            this.paths = this.api?.paths || {};
            this.components = this.api?.components?.schemas || {};
            this.definitions = this.api?.definitions || {};

            // Check if operationIds are present
            if (!this._checkOperationIds()) throw new Error("OperationIds are required for all paths");

            const options = {};

            // Set baseURL if host and basePath are present in swagger doc
            this.host = this.api?.host || null;
            this.basePath = this.api?.basePath || null;
            this.protocol = this.api?.schemes?.[0] || "http";

            if (this.host) options.baseURL = `${this.protocol}://${this.host}${this.basePath}`;

            // Set options
            if (!this?.options?.baseURL && options.baseURL) this.options = { ...options, ...this.options };

            this.instance = axios.create(this.options);

            // Build paths
            this.builtPaths = this._buildPaths();

            return this;
        } catch (error) {
            throw error;
        }
    }

    _checkOperationIds() {
        const { paths } = this;

        for (const path in paths) {
            const methods = paths[path];
            for (const methodKey in methods) {
                const method = methods[methodKey];
                if (!method?.operationId || method?.operationId == "") return false;
            }
        }

        return true;
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

    _removeProperties(obj, properties) {
        const newObj = { ...obj };
        properties.forEach((property) => {
            delete newObj[property];
        });

        return newObj;
    }

    async export(filePath, options) {
        const validation = options?.validation || false;
        const es = options?.es || false;
        const ts = options?.ts || false;

        const dependencies = ['axios'];

        let addedXml2js = false, addedFormData = false;
        let str = '';

        if (es || ts) {
            str = `import axios${ts ? ', { CreateAxiosDefaults }' : ''} from "axios";\n`;
        } else {
            str = `const axios = require("axios");\n`;
        }

        // Add URLSearchParams
        if (es || ts) {
            str += `import { URLSearchParams } from "url";\n`;
        } else {
            str += `const { URLSearchParams } = require("url");\n`;
        }

        if (validation) {
            dependencies.push('jsonschema');
            if (es || ts) {
                str += `import { Validator } from "jsonschema";\n`;
            } else {
                str += `const { Validator } = require("jsonschema");\n`;
            }
        }

        // Add convert url function
        str += `\nconst convertUrl = (${ts ? 'path:string, params:object | {}, query:any | {}' : 'path, params, query'}) => {\n`;
        str += `    const queryString = new URLSearchParams(query).toString();\n`;
        str += `    const urlPath = path.replace(/{(.*?)}/g, (m, c) => params[c]);\n`;
        str += `    const url = \`\${urlPath}\${queryString ? \`?\${queryString}\` : ""}\`;\n`;
        str += `    return url;\n`;
        str += `};\n`;

        str += `\nclass Client {\n`;
        if (ts) {
            str += `    instance: any;\n`;
            str += `    validator: Validator;\n\n`;
        }
        str += `    constructor(options${ts ? ': CreateAxiosDefaults<any> | {}' : ''}) {\n`;
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
                    str += `    async ${method.operationId}(args${ts ? ': { params: object | {}; query: object | {}; body: any | {}; options:any | {}; }' : ''})${ts ? ': Promise<object>' : ''} {\n`;
                    str += `        return new Promise(async (resolve, reject) => {\n`;
                    str += `            try {\n`;
                    str += `                const { params = {}, query = {}, body = {}, options = {} } = args;\n\n`;
                    // Add validation
                    if (validation && Object.keys(primeSchema).length > 0) {
                        str += `                const id = "/${method.operationId}";\n\n`;
                        // Validate query
                        if (primeSchema.query) {
                            str += `                const queryValidation = this.validator.validate(query, {\n`;
                            str += `                    id,\n`;
                            str += `                    ...${JSON.stringify(primeSchema.query, null, 2)}\n`;
                            str += `                });\n\n`;
                            if (ts) {
                                str += `                queryValidation.errors?.forEach((error: any) => {\n`;
                                str += `                    throw new Error(error);\n`;
                                str += `                });\n\n`;
                            } else {
                                str += `                if (queryValidation?.errors?.length > 0) throw new Error(queryValidation.errors);\n\n`;
                            }
                        }
                        // Validate params
                        if (primeSchema.path) {
                            str += `                const paramsValidation = this.validator.validate(params, {\n`;
                            str += `                    id,\n`;
                            str += `                    ...${JSON.stringify(primeSchema.path, null, 2)}\n`;
                            str += `                });\n\n`;
                            if (ts) {
                                str += `                paramsValidation.errors?.forEach((error: any) => {\n`;
                                str += `                    throw new Error(error);\n`;
                                str += `                });\n\n`;
                            } else {
                                str += `                if (paramsValidation?.errors?.length > 0) throw new Error(paramsValidation.errors);\n\n`;
                            }
                        }
                        // Validate body
                        if (primeSchema.body) {
                            str += `                const bodyValidation = this.validator.validate(body, {\n`;
                            str += `                    id,\n`;
                            str += `                    ...${JSON.stringify(primeSchema.body, null, 2)}\n`;
                            str += `                });\n\n`;
                            if (ts) {
                                str += `                bodyValidation.errors?.forEach((error: any) => {\n`;
                                str += `                    throw new Error(error);\n`;
                                str += `                });\n\n`;
                            } else {
                                str += `                if (bodyValidation?.errors?.length > 0) throw new Error(bodyValidation.errors);\n\n`;
                            }
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

                            // add form-data dependency
                            if (!addedFormData) {
                                dependencies.push('form-data');
                                if (es || ts) {
                                    str = `import FormData from "form-data";\n` + str;
                                } else {
                                    str = `const FormData = require("form-data");\n` + str;
                                }

                                addedFormData = true;
                            }

                            str += `                const formData = new FormData();\n`;
                            str += `                for (const key in body) formData.append(key, body[key]);\n`;
                            str += `                body = formData;\n`;
                        } else if (contentType == "application/x-www-form-urlencoded") {
                            // Convert body to url encoded
                            str += `                body = new URLSearchParams(body).toString();\n`;

                        } else if (contentType == "application/xml") {

                            // add xml2js dependency
                            if (!addedXml2js) {
                                dependencies.push('xml2js');
                                if (es || ts) {
                                    str = `import xml2js from "xml2js";\n` + str;
                                } else {
                                    str = `const xml2js = require('xml2js');\n` + str;
                                }

                                addedXml2js = true;
                            }

                            // Convert body to xml
                            str += `                const builder = new xml2js.Builder();\n`;
                            str += `                body = builder.buildObject(body);\n\n`;
                        }
                        // Add content-type header
                        str += `                if (!options?.headers) options.headers = {};\n`;
                        str += `                options.headers["content-type"] = "${contentType}";\n\n`;
                    }

                    // Convert params object to query string
                    str += `                const url = convertUrl("${path}", params, query);\n\n`;
                    str += `                const response = await this.instance({\n`;
                    str += `                    method: "${methodKey}",\n`;
                    str += `                    url,\n`;
                    str += `                    params,\n`;
                    str += `                    data: body,\n`;
                    str += `                    ...options,\n`;
                    str += `                });\n\n`;
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

        return dependencies;
    }
}

if (require.main === module) {
    // Run as script
    try {
        const path = require('path'), fs = require('fs'),
            { ArgumentParser } = require('argparse'),
            { version } = require('./package.json');

        const parser = new ArgumentParser({
            description: chalk.bold.blue('Swagger Client Builder'),
        });

        parser.add_argument('-i', '--input', { help: 'Input swagger file path or URL', required: true });
        parser.add_argument('-o', '--output', { help: 'Output file', required: true });
        parser.add_argument('-v', '--validation', { help: 'Add validation' });
        parser.add_argument('-e', '--es', { help: 'Use ES module import instead of CommonJs' });
        parser.add_argument('-V', '--version', { help: 'Show version', action: 'version', version });

        const args = parser.parse_args();

        const output = path.resolve(args.output);
        // get extension of output file
        const ext = path.extname(output);

        const validation = args.validation || false;
        const es = args.es || false;
        const ts = ext == '.ts' || false;

        (async () => {
            const Client = new SwaggerClientBuilder(args.input);

            await Client.build();

            const dependencies = await Client.export(output, { validation, es, ts });

            console.log(chalk.bold.green(`Swagger client exported to ${output}\n`));

            console.log(chalk.bold.bgBlue(`Remember to install dependencies:\n`))

            console.log(`npm install ${dependencies.join(' ')}\n\nOr:\n\nyarn add ${dependencies.join(' ')}\n`);
        })();
    } catch (error) {
        console.error(chalk.bold.red(error.message));
    }
}

module.exports = SwaggerClientBuilder;