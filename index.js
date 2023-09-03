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

    async export(filePath, options) {
        const validation = options?.validation || false;
        const es = options?.es || false;
        const ts = options?.ts || false;
        const target = options?.target || 'file';

        const dependencies = ['axios'];

        let addedXml2js = false, addedFormData = false;

        let strHead = '';
        
        // Suppress typescript errors coming from jsonschema module
        // Because some properties like "default, example, xml, externalDocs" are not defined in the definition
        if (ts && validation) strHead += `//@ts-nocheck\n`;

        if (es || ts) {
            strHead += `import axios${ts ? ', { CreateAxiosDefaults }' : ''} from "axios";\n`;
        } else {
            strHead += `const axios = require("axios");\n`;
        }

        // Add URLSearchParams
        if (es || ts) {
            strHead += `import { URLSearchParams } from "url";\n`;
        } else {
            strHead += `const { URLSearchParams } = require("url");\n`;
        }


        let str = '';
        if (validation) {
            dependencies.push('jsonschema');
            if (es || ts) {
                strHead += `import { Validator } from "jsonschema";\n`;
            } else {
                strHead += `const { Validator } = require("jsonschema");\n`;
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
            if (validation) str += `    validator: Validator;\n`;
        }
        str += `\n    constructor(options${ts ? ': CreateAxiosDefaults<any> | {}' : ''}) {\n`;
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
                    str += `     * ${path} ${method?.summary ? '(' + method.summary + ')' : ''}\n`;
                    str += `     * @param {Object} args\n`;
                    str += `     * @param {Object} args.params Path parameters\n`;
                    str += `     * @param {Object} args.query Query parameters\n`;
                    str += `     * @param {Object} args.body Request body\n`;
                    str += `     * @param {Object} args.options Axios request options\n`;
                    str += `     * @returns {Promise<Object>} Response\n`;
                    str += `     */\n`;
                    str += `    async ${method.operationId}(${ts ? 'args: { params: object | {}; query: object | {}; body: any | {}; options: any | {}}' : '{ params = {}, query = {}, body = {}, options = {} }'})${ts ? ': Promise<object>' : ''} {\n`;
                    str += `        return new Promise(async (resolve, reject) => {\n`;
                    str += `            try {\n`;
                    if (ts) str += `                				const {params, query, body, options} = args;\n\n`;

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
                                str += `                const bodyValidation = this.validator.validate(body, ${JSON.stringify(requestBodySchema, null, 2)});\n\n`;
                                if (ts) {
                                    str += `                bodyValidation.errors?.forEach((error: any) => {\n`;
                                    str += `                    throw new Error(error);\n`;
                                    str += `                });\n\n`;
                                } else {
                                    str += `                if (bodyValidation?.errors?.length > 0) throw new Error(bodyValidation.errors);\n\n`;
                                }
                            }
                        }

                        // Convert body to content-type
                        if (contentType == "multipart/form-data") {
                            // Convert body to form data

                            // add form-data dependency
                            if (!addedFormData) {
                                dependencies.push('form-data');
                                if (es || ts) {
                                    strHead += `import FormData from "form-data";\n`;
                                } else {
                                    strHead += `const FormData = require("form-data");\n`;
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
                                    strHead += `import xml2js from "xml2js";\n`;
                                } else {
                                    strHead += `const xml2js = require('xml2js');\n`;
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

        // Combine head and body
        str = strHead + str;

        // Beautify code
        const beautifiedCode = beautify(str, { indent_size: 2, space_in_empty_paren: true });

        if (target == 'file') await fs.writeFile(filePath, beautifiedCode);

        return {
            dependencies,
            code: beautifiedCode
        };
    }
}

if (require.main === module) {
    // Run as script
    (async () => {
        try {
            const path = require('path'), fs = require('fs'),
                isValidPath = require('is-valid-path'),
                validUrl = require('valid-url'),
                yesno = require('yesno'),
                { ArgumentParser } = require('argparse'),
                { version } = require('./package.json');

            const parser = new ArgumentParser({
                description: chalk.bold.blue('Swagger Client Builder'),
            });

            const supportedExtensions = ['.js', '.ts'];
            const swaggerExtensions = ['.json', '.yaml', '.yml'];

            parser.add_argument('-i', '--input', { help: `Input swagger file path or URL (${swaggerExtensions.join(' or ')})`, required: true });
            parser.add_argument('-o', '--output', { help: `Output file path (${supportedExtensions.join(' or ')})`, required: false });
            parser.add_argument('-v', '--validation', { help: 'Add validation' });
            parser.add_argument('-e', '--es', { help: 'Use ES module import instead of CommonJs' });
            parser.add_argument('-T', '--ts', { help: 'Use TypeScript instead of JavaScript' });
            parser.add_argument('-s', '--silent', { help: 'Silent export (just export without prompts but will show errors)', default: false });
            parser.add_argument('-t', '--target', { help: 'Target output ("file" or "bash")', default: 'file' });
            parser.add_argument('-V', '--version', { help: 'Show version', action: 'version', version });

            const args = parser.parse_args();

            let output;
            const ts = args.ts || false;
            let ext;


            // Check if input is a valid path or url
            if (!isValidPath(args.input) && !validUrl.isUri(args.input)) throw new Error("Input must be a valid path or url");

            // Check if input file is a swagger file
            if (!swaggerExtensions.includes(path.extname(args.input))) throw new Error(`Input file extension must be ${swaggerExtensions.join(' or ')} ')}`);

            if (args.target == 'file') {
                if (!args.output) throw new Error("Output file is required if target is file");

                output = path.resolve(args.output);

                // get extension of output file
                ext = path.extname(output);

                // Check if output file is a javascript or typescript file
                if (!supportedExtensions.includes(ext)) throw new Error(`Output file extension must be ${supportedExtensions.join(' or ')} ')}`);

                // Check if output file is a valid path
                if (!isValidPath(args.output)) throw new Error("Output must be a valid path");

                // Check if output file already exists
                if (fs.existsSync(output) && !args.silent) {
                    const ok = await yesno({
                        question: chalk.bold(`File ${output} already exists. Do you want to overwrite it? (y/n)`),
                        defaultValue: false,
                    })

                    if (!ok) process.exit(0);
                }
            }


            const validation = args.validation || false;
            const es = args.es || false;

            const Client = new SwaggerClientBuilder(args.input);

            await Client.build();

            const { dependencies, code } = await Client.export(output, { validation, es, ts, target: args.target });

            if (args.target == 'bash') {
                console.log(code);
            } else {
                if (!args.silent) {
                    console.log(chalk.bold.green(`Swagger client exported to ${output}\n`));

                    console.log(chalk.bold.bgBlue(`Remember to install dependencies:\n`))

                    console.log(`npm install ${dependencies.join(' ')}\n\nOr:\n\nyarn add ${dependencies.join(' ')}\n`);
                }
            }
        } catch (error) {
            console.error(chalk.bold.red(error.message));
        }
    })();
}

module.exports = SwaggerClientBuilder;