const jsonschema = require("jsonschema");
const axios = require("axios");
const FormData = require("form-data");

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
        if (!options) options = {};
        this.instance = axios.create(options);
    }


    /**
     * Build the API client
     * @returns {Object}
     */
    build() {
        try {
            const that = this;
            const { swaggerJson, validator } = this;
            if (!swaggerJson?.swaggerDoc?.components?.schemas) swaggerJson.swaggerDoc.components.schemas = {};

            const { paths, components } = swaggerJson.swaggerDoc;

            const { schemas: componentsSchemas } = components;

            const pathsKeys = Object.keys(paths);

            const primeObject = {};

            // Loop through paths
            for (let path of pathsKeys) {
                const methods = paths[path];

                primeObject[path] = {};

                Object.keys(methods).forEach((methodKey) => {
                    const method = methods[methodKey];
                    const { parameters } = method;

                    // Convert parameters to jsonschema
                    const primeSchema = {};

                    parameters.forEach((parameter) => {
                        const { name, required, schema, in: at } = parameter;
                        if (at) {
                            if (!primeSchema[at]) primeSchema[at] = {};
                            primeSchema[at][name] = {
                                ...schema,
                                required,
                            };
                        }
                    });

                    primeObject[path][methodKey] = async function () {
                        return new Promise(
                            async (resolve, reject) => {
                                try {
                                    // Get parameters from arguments
                                    const args = Array.from(arguments);

                                    if(!args?.[0]) args[0] = {};

                                    const params = args?.[0]?.params || {};
                                    const query = args?.[0]?.query || {};
                                    const body = args?.[0]?.body || {};
                                    const options = args?.[0]?.options || {};

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

                                    if (methodKey === "post" || methodKey === "put" || methodKey === "patch") {
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
                                    const requestBodySchema = method?.requestBody?.content?.[contentType]?.schema?.$ref;
                                    if (requestBodySchema) {
                                        // Get component
                                        const split = requestBodySchema.split("/");
                                        const componentName = split[split.length - 1];
                                        const component = componentsSchemas?.[componentName];

                                        if (component) {
                                            // Validate body
                                            const bodyValidation = validator.validate(body, component);

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
                });
            }

            return primeObject;

        } catch (error) {
            throw error;
        }
    }
}

module.exports = SwaggerClientBuilder;
