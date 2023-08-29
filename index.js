const { Validator } = require("jsonschema"), axios = require("axios"), FormData = require("form-data"), xml2js = require('xml2js');
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
        this.paths = this._buildPaths();

        // Add methods
        for (const method of methods) {
            this[method] = async function (path, args) {
                if (!this?.paths?.[path]?.[method]) throw new Error(`Method "${method.toUpperCase()}->${path}" not found`);
                return this.paths[path][method](args);
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
                    const primeSchema = {};

                    if (parameters) {
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
                    }


                    primeObject[path][methodKey] = async function () {
                        return new Promise(async (resolve, reject) => {
                            try {
                                // Get parameters from arguments
                                const [args = {}] = arguments;

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
                    if(method?.operationId && method?.operationId != "") this[method.operationId] = primeObject[path][methodKey];
                }
            }

            return primeObject;

        } catch (error) {
            throw error;
        }
    }
}

module.exports = SwaggerClientBuilder;