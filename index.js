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
     * @param {any} swaggerJson Swagger JSON
     * @param {any} options Axios options
     * @returns {any} SwaggerClientBuilder instance
     */
    constructor(swaggerJson, options) {
        if (!swaggerJson) throw new Error("swaggerJson is required");

        try {
            JSON.parse(JSON.stringify(swaggerJson));
        } catch (error) {
            throw new Error("swaggerJson is not valid");
        }

        this.swaggerJson = swaggerJson;
        this.validator = new jsonschema.Validator();
        this.options = options || {};

        this.paths = swaggerJson?.paths || {};
        this.components = swaggerJson?.components?.schemas || {};
        this.definitions = swaggerJson?.definitions || {};

        this.host = swaggerJson?.host || null;
        this.basePath = swaggerJson?.basePath || null;
        this.protocol = swaggerJson?.schemes?.[0] || "http";

        if (this.host) this.options.baseURL = `${this.protocol}://${this.host}${this.basePath}`;

        this.instance = axios.create(this.options);
    }

    _resolveRef(ref) {
        const split = ref.split("/");

        // Get location
        let location = split[1];
        
        if (!["definitions", "components"].includes(location)) location = split[2];

        const componentName = split[split.length - 1];

        const component = this[location][componentName];

        if (component) {
            for (const key in this[location].properties) {
                if (component.properties[key]?.$ref) {
                    component.properties[key] = this._resolveRef(component.properties[key].$ref);
                }
            }

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
                        const { name, required, schema, in: at } = parameter;
                        if (at) {
                            if (!primeSchema[at]) primeSchema[at] = {};

                            if (schema?.$ref) {
                                primeSchema[at][name] = that._resolveRef(schema.$ref);
                            } else {
                                primeSchema[at][name] = {
                                    ...schema,
                                    required,
                                };
                            }
                        }
                    });

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
                                        type: "object",
                                        properties: primeSchema.query,
                                    });

                                    // Validate params
                                    const paramsValidation = validator.validate(params, {
                                        id,
                                        type: "object",
                                        properties: primeSchema.path,
                                    });

                                    // Validate body
                                    const bodyValidation = validator.validate(body, {
                                        id,
                                        type: "object",
                                        properties: primeSchema.body,
                                    });

                                    // Check errors
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

                                            // Create form data
                                            const formData = new URLSearchParams();

                                            // Add body to form data
                                            Object.keys(body).forEach((key) => {
                                                formData.append(key, body[key]);
                                            });

                                            // Set body to form data
                                            body = formData;
                                        }
                                    }

                                    // Validate requestBody component schema
                                    const requestBodySchema = method?.requestBody?.content?.[contentType]?.schema;
                                    if (requestBodySchema) {
                                        if (requestBodySchema.$ref) {
                                            const component = that._resolveRef(requestBodySchema.$ref);
                                            if (component) {
                                                // Validate body
                                                const bodyValidation = validator.validate(body, component);

                                                // Check errors
                                                if (bodyValidation?.errors?.length > 0) {
                                                    throw new BodyValidationError(bodyValidation.errors);
                                                }
                                            }
                                        } else {
                                            // Validate body
                                            const bodyValidation = validator.validate(body, requestBodySchema);

                                            // Check errors
                                            if (bodyValidation?.errors?.length > 0) {
                                                throw new BodyValidationError(bodyValidation.errors);
                                            }
                                        }
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