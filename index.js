#!/usr/bin/env node

const beautify = require('js-beautify/js').js,
    { Validator } = require("jsonschema"),
    axios = require("axios"),
    FormData = require("form-data"),
    xml2js = require('xml2js'),
    fs = require('fs').promises,
    SwaggerParser = require('swagger-parser'),
    { URLSearchParams } = require('url'),
    Mustache = require('mustache'),
    Path = require('path'),
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

    async prepareForMustache() {
        const paths = [];
        const dependencies = {};
        for (const path in this.paths) {
            const methods = this.paths[path];
            for (const methodKey in methods) {
                const method = methods[methodKey];
                const { parameters } = method;

                let schema = {};
                if (parameters) schema = this._prepareParameters(parameters);

                // Replace path parameters

                const contentType = Object.keys(method?.requestBody?.content || {})[0] || "application/json";

                if (contentType == 'multipart/form-data') {
                    dependencies['FormData'] = ['form-data'];
                } else if (contentType == 'application/xml') {
                    dependencies['xml2js'] = ['xml2js'];
                }
                paths.push({
                    id: `${path}/${methodKey}`,
                    path,
                    method: methodKey,
                    description: `${methodKey.toUpperCase()} ${path}${method?.summary ? ' (' + method.summary + ')' : ''}`,
                    operationId: method?.operationId || null,
                    contentType,
                    isPost: ['post', 'put', 'patch'].includes(methodKey),
                    isXML: contentType == 'application/xml',
                    isFormData: contentType == 'multipart/form-data',
                    isUrlEncoded: contentType == 'application/x-www-form-urlencoded',
                    paramsSchema: schema?.params ? JSON.stringify(schema.params, null, 4) : null,
                    querySchema: schema?.query ? JSON.stringify(schema.query, null, 4) : null,
                    bodySchema: schema?.body ? JSON.stringify(schema.body, null, 4) : null,
                    requestBodySchema: method?.requestBody?.content?.[contentType]?.schema ? JSON.stringify(method.requestBody.content[contentType].schema, null, 4) : null,
                    renderId: schema?.params || schema?.query || schema?.body || method?.requestBody?.content?.[contentType]?.schema ? true : false,
                });
            }
        }

        return {
            paths,
            dependencies
        };
    }


    /**
     * Export client to a file
     * @param {any} filePath Export file path
     * @param {any} options Export options
     * @param {any} options.validation Add validation
     * @param {any} options.es Use ES module import instead of CommonJs
     * @param {any} options.ts Use TypeScript instead of JavaScript
     * @param {any} options.target Target output ("file" or "bash")
     * @returns {any}
     */
    async export(filePath, options) {
        const validation = options?.validation || false,
            es = options?.es || false,
            ts = options?.ts || false,
            target = options?.target || 'file';

        const dependencies = [
            { name: 'axios', path: 'axios' },
            { name: '{ URLSearchParams }', path: 'url' },
        ];

        const prepared = await this.prepareForMustache();

        // Add dependencies
        for (const dependency in prepared.dependencies) {
            dependencies.push({ name: dependency, path: prepared.dependencies[dependency] });
        }

        const code = Mustache.render((await fs.readFile(Path.join(__dirname, 'template.mustache'), 'utf8')).toString(), {
            ts,
            es,
            validation,
            dependencies,
            paths: prepared.paths,
        })

        const beautifiedCode = beautify(code, { indent_size: 4, space_in_empty_paren: true });

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

            let output, ext;
            const ts = args.ts || false;

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


            const validation = args.validation || false,
                es = args.es || false;

            const Client = new SwaggerClientBuilder(args.input);

            await Client.build();

            const { code } = await Client.export(output, { validation, es, ts, target: args.target });

            if (args.target == 'bash') {
                console.log(code);
            } else {
                if (!args.silent) console.log(chalk.bold.green(`Swagger client exported to ${output}\n`));
            }
        } catch (error) {
            console.error(chalk.bold.red(error.message));
        }
    })();
}

module.exports = SwaggerClientBuilder;