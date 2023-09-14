#!/usr/bin/env node

const { URLSearchParams } = require('url'),
    { Validator } = require("jsonschema"),
    { version } = require('./package.json'),
    Ajv = require("ajv"),
    axios = require("axios"),
    beautify = require('js-beautify/js').js,
    chalk = require('chalk'),
    FormData = require("form-data"),
    Fs = require('fs'),
    fs = require('fs').promises,
    isValidPath = require('is-valid-path'),
    Mustache = require('mustache'),
    Path = require('path'),
    SwaggerParser = require('swagger-parser'),
    validUrl = require('valid-url'),
    xml2js = require('xml2js'),
    yesno = require('yesno');

class ValidationError extends Error {
    constructor(message) {
        let stack = [];

        message.forEach(err => {
            stack.push(`${err.instancePath} ${err.message}, got "${typeof err.data}"`);
        });

        super(stack.join(', '));
        this.name = "ValidationError";
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

            this.validator = new Ajv({ allErrors: true, verbose: true });
            this._wrapAjv();

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

    _wrapAjv() {
        this.validator.addKeyword({
            keyword: 'xml'
        });

        this.validator.addKeyword({
            keyword: 'example'
        });

        this.validator.addFormat('int32', (data) => {
            return !isNaN(data) && data >= -2147483648 && data <= 2147483647;
        });

        this.validator.addFormat('int64', (data) => {
            return !isNaN(data) && data >= -9223372036854775808n && data <= 9223372036854775807n;
        });

        this.validator.addFormat('float', (data) => {
            return !isNaN(data) && data >= -3.402823e+38 && data <= 3.402823e+38;
        });

        this.validator.addFormat('double', (data) => {
            return !isNaN(data) && data >= -1.7976931348623157e+308 && data <= 1.7976931348623157e+308;
        });
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

                primeSchema[at].properties[name] = schema

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

                                // Validate query
                                if (primeSchema.query) {
                                    const queryValidation = this.validator.compile(primeSchema.query)
                                    if (!queryValidation.schemaEnv.validate(query)) throw new ValidationError(queryValidation.errors);
                                }

                                // Validate params
                                if (primeSchema.path) {
                                    const paramsValidation = this.validator.compile(primeSchema.path)
                                    if (!paramsValidation.schemaEnv.validate(params)) throw new ValidationError(paramsValidation.errors);
                                }

                                // Validate body
                                if (primeSchema.body) {
                                    const bodyValidation = this.validator.compile(primeSchema.body)
                                    if (!bodyValidation.schemaEnv.validate(query)) throw new ValidationError(bodyValidation.errors);
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
                                        const bodyValidation = this.validator.compile(requestBodySchema)
                                        if (!bodyValidation.schemaEnv.validate(body)) throw new ValidationError(bodyValidation.errors);
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

    async _prepareForMustache(validation) {
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
                    renderId: schema?.params || schema?.query || schema?.body || method?.requestBody?.content?.[contentType]?.schema ? validation ? true : false : false,
                });
            }
        }

        return {
            paths,
            dependencies
        };
    }

    _removeDoubleEmptyLines(code) {
        return code.replace(/(\r\n|\r|\n){3,}/g, '\n');
    }

    /**
     * Export client to a file
     * @param {string} filePath Export file path
     * @param {object} options Export options
     * @param {boolean} options.validation Add validation
     * @param {boolean} options.es Use ES module import instead of CommonJs
     * @param {boolean} options.ts Use TypeScript instead of JavaScript
     * @param {string} options.target Target output ("file" or "bash")
     * @returns {object}
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

        if (validation) dependencies.push({ name: 'Ajv', path: 'ajv' });
        if (ts) {
            dependencies.push({ name: '{ CreateAxiosDefaults }', path: 'axios' });
        }

        const prepared = await this._prepareForMustache(validation);

        // Add dependencies
        for (const dependency in prepared.dependencies) {
            dependencies.push({ name: dependency, path: prepared.dependencies[dependency] });
        }


        let code = Mustache.render((await fs.readFile(Path.join(__dirname, 'template.mustache'), 'utf8')).toString(), {
            ts,
            es,
            validation,
            dependencies,
            paths: prepared.paths,
        })

        code = this._removeDoubleEmptyLines(code);

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
            const argv = require('minimist')(process.argv.slice(2), {
                string: ["input", "output", "target"],
                boolean: ["ts", "es", "validation", "silent", "help", "version"],
                alias: {
                    input: "i",
                    verbose: "v",
                    output: "o",
                    validation: "v",
                    es: "e",
                    ts: "t",
                    silent: "s",
                    target: "T",
                    help: "h",
                    version: "V",
                },
            });

            const supportedExtensions = ['.js', '.ts'];
            const swaggerExtensions = ['.json', '.yaml', '.yml'];

            if (argv.h || argv.help) {
                const message = [
                    chalk.blue.bold(`Swagger Client Builder - v${version}\n`),
                    "Usage: swagger-client-builder -i <input> -o <output> [options]",
                    "Options:\n",
                    `  -i, --input\t\tInput swagger file path or URL (${swaggerExtensions.join(' or ')})`,
                    `  -o, --output\t\tOutput file path (${supportedExtensions.join(' or ')})`,
                    "  -v, --validation\tUse jsonschema validation",
                    "  -e, --es\t\tUse ES module import instead of CommonJs",
                    "  -t, --ts\t\tUse TypeScript instead of JavaScript",
                    "  -s, --silent\t\tSilent export (just export without prompts but will show errors)",
                    "  -T, --target\t\tTarget output (\"file\" or \"bash\")",
                    "  -V, --version\t\tShow version",
                ]
                console.log(message.join("\n"));
                process.exit(0);
            } else if (argv.V || argv.version) {
                console.log(version);
                process.exit(0);
            } else {
                const args = {
                    input: argv.i || argv.input,
                    output: argv.o || argv.output,
                    validation: argv.v || argv.validation || false,
                    es: argv.e || argv.es || false,
                    ts: argv.t || argv.ts || false,
                    silent: argv.s || argv.silent || false,
                    target: argv.T || argv.target || 'file',
                    version: argv.V || argv.version || false,
                };

                let output, ext;
                const ts = args.ts || false;

                // Check if input is a valid path or url
                if (!isValidPath(args.input) && !validUrl.isUri(args.input)) throw new Error("Input must be a valid path or url");

                // Check if input file is a swagger file
                if (!swaggerExtensions.includes(Path.extname(args.input))) throw new Error(`Input file extension must be ${swaggerExtensions.join(' or ')} ')}`);

                if (args.target == 'file') {
                    if (!args.output) throw new Error("Output file is required if target is file");

                    output = Path.resolve(args.output);

                    // get extension of output file
                    ext = Path.extname(output);

                    // Check if output file is a javascript or typescript file
                    if (!supportedExtensions.includes(ext)) throw new Error(`Output file extension must be ${supportedExtensions.join(' or ')} ')}`);

                    // Check if extension is correct
                    if (ts && ext != '.ts') throw new Error("Output file extension must be .ts if ts option is enabled");
                    if (!ts && ext != '.js') throw new Error("Output file extension must be .js if ts option is disabled");

                    // Check if output file is a valid path
                    if (!isValidPath(args.output)) throw new Error("Output must be a valid path");

                    // Check if output file already exists
                    if (Fs.existsSync(output) && !args.silent) {
                        const ok = await yesno({
                            question: chalk.bold(`File "${output}" already exists. Do you want to overwrite it? (y/n)`),
                            defaultValue: false,
                        })

                        if (!ok) process.exit(0);
                    }
                }


                const validation = args.validation || false, es = args.es || false;

                const Client = new SwaggerClientBuilder(args.input);

                await Client.build();

                const { code } = await Client.export(output, { validation, es, ts, target: args.target });

                if (args.target == 'bash') {
                    console.log(code);
                } else {
                    if (!args.silent) console.log(chalk.bold.green(`Swagger client exported to ${output}\n`));
                }
            }
        } catch (error) {
            console.error(chalk.bold.red(error.message));
        }
    })();
}

module.exports = SwaggerClientBuilder;