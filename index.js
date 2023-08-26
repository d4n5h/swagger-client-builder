const jsonschema = require("jsonschema"), axios = require("axios"), FormData = require("form-data");

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

        this.swaggerJson = swaggerJson;
        this.paths = swaggerJson?.paths || {};
        this.components = swaggerJson?.components?.schemas || {};
        this.definitions = swaggerJson?.definitions || {};

        this.swaggerJson = this._resolveRefs(this.swaggerJson)

        // Reassign after resolving refs
        this.definitions = this.swaggerJson?.definitions || {};
        this.components = this.swaggerJson?.components?.schemas || {};

        this.validator = new jsonschema.Validator();
        this.options = options || {};

        this.host = swaggerJson?.host || null;
        this.basePath = swaggerJson?.basePath || null;
        this.protocol = swaggerJson?.schemes?.[0] || "http";

        if (this.host) this.options.baseURL = `${this.protocol}://${this.host}${this.basePath}`;

        this.instance = axios.create(this.options);
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

    /**
     * Build the API client
     * @returns {Object}
     */
    build() {
        try {
            const that = this;
            const { validator, paths } = this;

            const pathsKeys = Object.keys(paths);

            const primeObject = {};

            // Loop through paths
            for (const path of pathsKeys) {
                const methods = paths[path];

                primeObject[path] = {};

                for (const methodKey in methods) {
                    const method = methods[methodKey];
                    const { parameters } = method;

                    // Convert parameters to jsonschema
                    const primeSchema = {};

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

                            if (required) {
                                primeSchema[at].required.push(name);
                            }
                        }
                    });

                    // console.log(JSON.stringify(primeSchema, null, 2))
                    primeObject[path][methodKey] = async function () {
                        return new Promise(
                            async (resolve, reject) => {
                                try {
                                    // Get parameters from arguments
                                    const [args = {}] = arguments;

                                    const { params = {}, query = {}, body = {}, options = {} } = args;

                                    const id = `${path}/${methodKey}`;

                                    // Validate query
                                    const queryValidation = validator.validate(query, {
                                        id,
                                        ...primeSchema.query
                                    });

                                    // Validate params
                                    const paramsValidation = validator.validate(params, {
                                        id,
                                        ...primeSchema.path
                                    });

                                    // Validate body
                                    const bodyValidation = validator.validate(body, {
                                        id,
                                        ...primeSchema.body
                                    });

                                    // Validate query, params and body
                                    if (queryValidation?.errors?.length > 0) {
                                        throw new QueryValidationError(queryValidation.errors);
                                    } else if (paramsValidation?.errors?.length > 0) {
                                        throw new ParamsValidationError(paramsValidation.errors);
                                    } else if (bodyValidation?.errors?.length > 0) {
                                        throw new BodyValidationError(bodyValidation.errors);
                                    }

                                    // Replace path parameters
                                    const urlPath = path.replace(/{(.*?)}/g, (m, c) => params[c]);

                                    // Convert params object to query string
                                    const queryString = new URLSearchParams(query).toString();

                                    // Build url
                                    const url = `${urlPath}${queryString ? `?${queryString}` : ""}`;

                                    // Set content-type
                                    let contentType = "application/json";

                                    if (["post", "put", "patch"].includes(methodKey)) {
                                        if (method?.requestBody?.content?.["multipart/form-data"]) {

                                            contentType = "multipart/form-data";

                                            // Create form data
                                            const formData = new FormData();

                                            // Add body to form data
                                            Object.keys(body).forEach((key) => {
                                                formData.append(key, body[key]);
                                            });

                                            // Set body to form data
                                            body = formData;

                                        } else if (method?.requestBody?.content?.["application/x-www-form-urlencoded"]) {

                                            contentType = "application/x-www-form-urlencoded";

                                            // Set body to form data
                                            body = new URLSearchParams(body).toString();
                                        }
                                    }

                                    // Validate requestBody component schema
                                    const requestBodySchema = method?.requestBody?.content?.[contentType]?.schema;

                                    if (requestBodySchema) {
                                        // Validate body
                                        const bodyValidation = validator.validate(body, requestBodySchema);
                                        if (bodyValidation?.errors?.length > 0) throw new BodyValidationError(bodyValidation.errors);
                                    }

                                    // Make request
                                    const response =
                                        await that.instance({
                                            method: methodKey,
                                            url,
                                            data: body,
                                            headers: {
                                                "content-type": contentType,
                                            },
                                            ...options,
                                        });

                                    resolve(response);
                                } catch (error) {
                                    reject(error);
                                }
                            }
                        );
                    };
                }
            }

            return primeObject;

        } catch (error) {
            throw error;
        }
    }
}

module.exports = SwaggerClientBuilder;