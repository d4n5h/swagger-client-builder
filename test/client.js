const axios = require("axios");
const {
    URLSearchParams
} = require("url");
const {
    Validator
} = require("jsonschema");

const convertUrl = (path, params, query) => {
    const queryString = new URLSearchParams(query).toString();
    const urlPath = path.replace(/{(.*?)}/g, (m, c) => params[c]);
    const url = `${urlPath}${queryString ? `?${queryString}` : ""}`;
    return url;
};

class Client {

    constructor(options) {
        this.instance = axios.create(options);
        this.validator = new Validator();
    }

    /**
     * PUT /pet (Update an existing pet)
     * @param {Object} args
     * @param {Object} args.params Path parameters
     * @param {Object} args.query Query parameters
     * @param {Object} args.body Request body
     * @param {Object} args.options Axios request options
     * @returns {Promise<Object>} Response
     */
    async updatePet({
        params = {},
        query = {},
        body = {},
        options = {}
    }) {
        return new Promise(async (resolve, reject) => {
            try {
                const id = "/pet/put";

                const requestBodyValidation = this.validator.validate(body, {
                    id,
                    ...{
                        "required": [
                            "name",
                            "photoUrls"
                        ],
                        "type": "object",
                        "properties": {
                            "id": {
                                "type": "integer",
                                "format": "int64",
                                "example": 10
                            },
                            "name": {
                                "type": "string",
                                "example": "doggie"
                            },
                            "category": {
                                "type": "object",
                                "properties": {
                                    "id": {
                                        "type": "integer",
                                        "format": "int64",
                                        "example": 1
                                    },
                                    "name": {
                                        "type": "string",
                                        "example": "Dogs"
                                    }
                                },
                                "xml": {
                                    "name": "category"
                                }
                            },
                            "photoUrls": {
                                "type": "array",
                                "xml": {
                                    "wrapped": true
                                },
                                "items": {
                                    "type": "string",
                                    "xml": {
                                        "name": "photoUrl"
                                    }
                                }
                            },
                            "tags": {
                                "type": "array",
                                "xml": {
                                    "wrapped": true
                                },
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "id": {
                                            "type": "integer",
                                            "format": "int64"
                                        },
                                        "name": {
                                            "type": "string"
                                        }
                                    },
                                    "xml": {
                                        "name": "tag"
                                    }
                                }
                            },
                            "status": {
                                "type": "string",
                                "description": "pet status in the store",
                                "enum": [
                                    "available",
                                    "pending",
                                    "sold"
                                ]
                            }
                        },
                        "xml": {
                            "name": "pet"
                        }
                    }
                });

                if (requestBodyValidation?.errors?.length > 0) throw new Error(requestBodyValidation.errors);

                if (!options?.headers) options.headers = {};
                options.headers["content-type"] = "application/json";

                const url = convertUrl("/pet", params, query);

                const response = await this.instance({
                    method: "put",
                    url,
                    params,
                    data: body,
                    ...options,
                });

                resolve(response);

            } catch (error) {
                reject(error);
            }
        });
    }
    /**
     * POST /pet (Add a new pet to the store)
     * @param {Object} args
     * @param {Object} args.params Path parameters
     * @param {Object} args.query Query parameters
     * @param {Object} args.body Request body
     * @param {Object} args.options Axios request options
     * @returns {Promise<Object>} Response
     */
    async addPet({
        params = {},
        query = {},
        body = {},
        options = {}
    }) {
        return new Promise(async (resolve, reject) => {
            try {
                const id = "/pet/post";

                const requestBodyValidation = this.validator.validate(body, {
                    id,
                    ...{
                        "required": [
                            "name",
                            "photoUrls"
                        ],
                        "type": "object",
                        "properties": {
                            "id": {
                                "type": "integer",
                                "format": "int64",
                                "example": 10
                            },
                            "name": {
                                "type": "string",
                                "example": "doggie"
                            },
                            "category": {
                                "type": "object",
                                "properties": {
                                    "id": {
                                        "type": "integer",
                                        "format": "int64",
                                        "example": 1
                                    },
                                    "name": {
                                        "type": "string",
                                        "example": "Dogs"
                                    }
                                },
                                "xml": {
                                    "name": "category"
                                }
                            },
                            "photoUrls": {
                                "type": "array",
                                "xml": {
                                    "wrapped": true
                                },
                                "items": {
                                    "type": "string",
                                    "xml": {
                                        "name": "photoUrl"
                                    }
                                }
                            },
                            "tags": {
                                "type": "array",
                                "xml": {
                                    "wrapped": true
                                },
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "id": {
                                            "type": "integer",
                                            "format": "int64"
                                        },
                                        "name": {
                                            "type": "string"
                                        }
                                    },
                                    "xml": {
                                        "name": "tag"
                                    }
                                }
                            },
                            "status": {
                                "type": "string",
                                "description": "pet status in the store",
                                "enum": [
                                    "available",
                                    "pending",
                                    "sold"
                                ]
                            }
                        },
                        "xml": {
                            "name": "pet"
                        }
                    }
                });

                if (requestBodyValidation?.errors?.length > 0) throw new Error(requestBodyValidation.errors);

                if (!options?.headers) options.headers = {};
                options.headers["content-type"] = "application/json";

                const url = convertUrl("/pet", params, query);

                const response = await this.instance({
                    method: "post",
                    url,
                    params,
                    data: body,
                    ...options,
                });

                resolve(response);

            } catch (error) {
                reject(error);
            }
        });
    }
    /**
     * GET /pet/findByStatus (Finds Pets by status)
     * @param {Object} args
     * @param {Object} args.params Path parameters
     * @param {Object} args.query Query parameters
     * @param {Object} args.body Request body
     * @param {Object} args.options Axios request options
     * @returns {Promise<Object>} Response
     */
    async findPetsByStatus({
        params = {},
        query = {},
        body = {},
        options = {}
    }) {
        return new Promise(async (resolve, reject) => {
            try {
                const id = "/pet/findByStatus/get";
                const queryValidation = this.validator.validate(query, {
                    id,
                    ...{
                        "type": "object",
                        "properties": {
                            "status": {
                                "required": false,
                                "type": "string",
                                "default": "available",
                                "enum": [
                                    "available",
                                    "pending",
                                    "sold"
                                ]
                            }
                        },
                        "required": []
                    }
                });

                if (queryValidation?.errors?.length > 0) throw new Error(queryValidation.errors);


                if (!options?.headers) options.headers = {};
                options.headers["content-type"] = "application/json";

                const url = convertUrl("/pet/findByStatus", params, query);

                const response = await this.instance({
                    method: "get",
                    url,
                    params,
                    data: body,
                    ...options,
                });

                resolve(response);

            } catch (error) {
                reject(error);
            }
        });
    }
    /**
     * GET /pet/findByTags (Finds Pets by tags)
     * @param {Object} args
     * @param {Object} args.params Path parameters
     * @param {Object} args.query Query parameters
     * @param {Object} args.body Request body
     * @param {Object} args.options Axios request options
     * @returns {Promise<Object>} Response
     */
    async findPetsByTags({
        params = {},
        query = {},
        body = {},
        options = {}
    }) {
        return new Promise(async (resolve, reject) => {
            try {
                const id = "/pet/findByTags/get";
                const queryValidation = this.validator.validate(query, {
                    id,
                    ...{
                        "type": "object",
                        "properties": {
                            "tags": {
                                "required": false,
                                "type": "array",
                                "items": {
                                    "type": "string"
                                }
                            }
                        },
                        "required": []
                    }
                });

                if (queryValidation?.errors?.length > 0) throw new Error(queryValidation.errors);


                if (!options?.headers) options.headers = {};
                options.headers["content-type"] = "application/json";

                const url = convertUrl("/pet/findByTags", params, query);

                const response = await this.instance({
                    method: "get",
                    url,
                    params,
                    data: body,
                    ...options,
                });

                resolve(response);

            } catch (error) {
                reject(error);
            }
        });
    }
    /**
     * GET /pet/{petId} (Find pet by ID)
     * @param {Object} args
     * @param {Object} args.params Path parameters
     * @param {Object} args.query Query parameters
     * @param {Object} args.body Request body
     * @param {Object} args.options Axios request options
     * @returns {Promise<Object>} Response
     */
    async getPetById({
        params = {},
        query = {},
        body = {},
        options = {}
    }) {
        return new Promise(async (resolve, reject) => {
            try {



                if (!options?.headers) options.headers = {};
                options.headers["content-type"] = "application/json";

                const url = convertUrl("/pet/{petId}", params, query);

                const response = await this.instance({
                    method: "get",
                    url,
                    params,
                    data: body,
                    ...options,
                });

                resolve(response);

            } catch (error) {
                reject(error);
            }
        });
    }
    /**
     * POST /pet/{petId} (Updates a pet in the store with form data)
     * @param {Object} args
     * @param {Object} args.params Path parameters
     * @param {Object} args.query Query parameters
     * @param {Object} args.body Request body
     * @param {Object} args.options Axios request options
     * @returns {Promise<Object>} Response
     */
    async updatePetWithForm({
        params = {},
        query = {},
        body = {},
        options = {}
    }) {
        return new Promise(async (resolve, reject) => {
            try {
                const id = "/pet/{petId}/post";
                const queryValidation = this.validator.validate(query, {
                    id,
                    ...{
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string"
                            },
                            "status": {
                                "type": "string"
                            }
                        },
                        "required": []
                    }
                });

                if (queryValidation?.errors?.length > 0) throw new Error(queryValidation.errors);


                if (!options?.headers) options.headers = {};
                options.headers["content-type"] = "application/json";

                const url = convertUrl("/pet/{petId}", params, query);

                const response = await this.instance({
                    method: "post",
                    url,
                    params,
                    data: body,
                    ...options,
                });

                resolve(response);

            } catch (error) {
                reject(error);
            }
        });
    }
    /**
     * DELETE /pet/{petId} (Deletes a pet)
     * @param {Object} args
     * @param {Object} args.params Path parameters
     * @param {Object} args.query Query parameters
     * @param {Object} args.body Request body
     * @param {Object} args.options Axios request options
     * @returns {Promise<Object>} Response
     */
    async deletePet({
        params = {},
        query = {},
        body = {},
        options = {}
    }) {
        return new Promise(async (resolve, reject) => {
            try {



                if (!options?.headers) options.headers = {};
                options.headers["content-type"] = "application/json";

                const url = convertUrl("/pet/{petId}", params, query);

                const response = await this.instance({
                    method: "delete",
                    url,
                    params,
                    data: body,
                    ...options,
                });

                resolve(response);

            } catch (error) {
                reject(error);
            }
        });
    }
    /**
     * POST /pet/{petId}/uploadImage (uploads an image)
     * @param {Object} args
     * @param {Object} args.params Path parameters
     * @param {Object} args.query Query parameters
     * @param {Object} args.body Request body
     * @param {Object} args.options Axios request options
     * @returns {Promise<Object>} Response
     */
    async uploadFile({
        params = {},
        query = {},
        body = {},
        options = {}
    }) {
        return new Promise(async (resolve, reject) => {
            try {
                const id = "/pet/{petId}/uploadImage/post";
                const queryValidation = this.validator.validate(query, {
                    id,
                    ...{
                        "type": "object",
                        "properties": {
                            "additionalMetadata": {
                                "required": false,
                                "type": "string"
                            }
                        },
                        "required": []
                    }
                });

                if (queryValidation?.errors?.length > 0) throw new Error(queryValidation.errors);

                const requestBodyValidation = this.validator.validate(body, {
                    id,
                    ...{
                        "type": "string",
                        "format": "binary"
                    }
                });

                if (requestBodyValidation?.errors?.length > 0) throw new Error(requestBodyValidation.errors);

                if (!options?.headers) options.headers = {};
                options.headers["content-type"] = "application/octet-stream";

                const url = convertUrl("/pet/{petId}/uploadImage", params, query);

                const response = await this.instance({
                    method: "post",
                    url,
                    params,
                    data: body,
                    ...options,
                });

                resolve(response);

            } catch (error) {
                reject(error);
            }
        });
    }
    /**
     * GET /store/inventory (Returns pet inventories by status)
     * @param {Object} args
     * @param {Object} args.params Path parameters
     * @param {Object} args.query Query parameters
     * @param {Object} args.body Request body
     * @param {Object} args.options Axios request options
     * @returns {Promise<Object>} Response
     */
    async getInventory({
        params = {},
        query = {},
        body = {},
        options = {}
    }) {
        return new Promise(async (resolve, reject) => {
            try {



                if (!options?.headers) options.headers = {};
                options.headers["content-type"] = "application/json";

                const url = convertUrl("/store/inventory", params, query);

                const response = await this.instance({
                    method: "get",
                    url,
                    params,
                    data: body,
                    ...options,
                });

                resolve(response);

            } catch (error) {
                reject(error);
            }
        });
    }
    /**
     * POST /store/order (Place an order for a pet)
     * @param {Object} args
     * @param {Object} args.params Path parameters
     * @param {Object} args.query Query parameters
     * @param {Object} args.body Request body
     * @param {Object} args.options Axios request options
     * @returns {Promise<Object>} Response
     */
    async placeOrder({
        params = {},
        query = {},
        body = {},
        options = {}
    }) {
        return new Promise(async (resolve, reject) => {
            try {
                const id = "/store/order/post";

                const requestBodyValidation = this.validator.validate(body, {
                    id,
                    ...{
                        "type": "object",
                        "properties": {
                            "id": {
                                "type": "integer",
                                "format": "int64",
                                "example": 10
                            },
                            "petId": {
                                "type": "integer",
                                "format": "int64",
                                "example": 198772
                            },
                            "quantity": {
                                "type": "integer",
                                "format": "int32",
                                "example": 7
                            },
                            "shipDate": {
                                "type": "string",
                                "format": "date-time"
                            },
                            "status": {
                                "type": "string",
                                "description": "Order Status",
                                "example": "approved",
                                "enum": [
                                    "placed",
                                    "approved",
                                    "delivered"
                                ]
                            },
                            "complete": {
                                "type": "boolean"
                            }
                        },
                        "xml": {
                            "name": "order"
                        }
                    }
                });

                if (requestBodyValidation?.errors?.length > 0) throw new Error(requestBodyValidation.errors);

                if (!options?.headers) options.headers = {};
                options.headers["content-type"] = "application/json";

                const url = convertUrl("/store/order", params, query);

                const response = await this.instance({
                    method: "post",
                    url,
                    params,
                    data: body,
                    ...options,
                });

                resolve(response);

            } catch (error) {
                reject(error);
            }
        });
    }
    /**
     * GET /store/order/{orderId} (Find purchase order by ID)
     * @param {Object} args
     * @param {Object} args.params Path parameters
     * @param {Object} args.query Query parameters
     * @param {Object} args.body Request body
     * @param {Object} args.options Axios request options
     * @returns {Promise<Object>} Response
     */
    async getOrderById({
        params = {},
        query = {},
        body = {},
        options = {}
    }) {
        return new Promise(async (resolve, reject) => {
            try {



                if (!options?.headers) options.headers = {};
                options.headers["content-type"] = "application/json";

                const url = convertUrl("/store/order/{orderId}", params, query);

                const response = await this.instance({
                    method: "get",
                    url,
                    params,
                    data: body,
                    ...options,
                });

                resolve(response);

            } catch (error) {
                reject(error);
            }
        });
    }
    /**
     * DELETE /store/order/{orderId} (Delete purchase order by ID)
     * @param {Object} args
     * @param {Object} args.params Path parameters
     * @param {Object} args.query Query parameters
     * @param {Object} args.body Request body
     * @param {Object} args.options Axios request options
     * @returns {Promise<Object>} Response
     */
    async deleteOrder({
        params = {},
        query = {},
        body = {},
        options = {}
    }) {
        return new Promise(async (resolve, reject) => {
            try {



                if (!options?.headers) options.headers = {};
                options.headers["content-type"] = "application/json";

                const url = convertUrl("/store/order/{orderId}", params, query);

                const response = await this.instance({
                    method: "delete",
                    url,
                    params,
                    data: body,
                    ...options,
                });

                resolve(response);

            } catch (error) {
                reject(error);
            }
        });
    }
    /**
     * POST /user (Create user)
     * @param {Object} args
     * @param {Object} args.params Path parameters
     * @param {Object} args.query Query parameters
     * @param {Object} args.body Request body
     * @param {Object} args.options Axios request options
     * @returns {Promise<Object>} Response
     */
    async createUser({
        params = {},
        query = {},
        body = {},
        options = {}
    }) {
        return new Promise(async (resolve, reject) => {
            try {
                const id = "/user/post";

                const requestBodyValidation = this.validator.validate(body, {
                    id,
                    ...{
                        "type": "object",
                        "properties": {
                            "id": {
                                "type": "integer",
                                "format": "int64",
                                "example": 10
                            },
                            "username": {
                                "type": "string",
                                "example": "theUser"
                            },
                            "firstName": {
                                "type": "string",
                                "example": "John"
                            },
                            "lastName": {
                                "type": "string",
                                "example": "James"
                            },
                            "email": {
                                "type": "string",
                                "example": "john@email.com"
                            },
                            "password": {
                                "type": "string",
                                "example": "12345"
                            },
                            "phone": {
                                "type": "string",
                                "example": "12345"
                            },
                            "userStatus": {
                                "type": "integer",
                                "description": "User Status",
                                "format": "int32",
                                "example": 1
                            }
                        },
                        "xml": {
                            "name": "user"
                        }
                    }
                });

                if (requestBodyValidation?.errors?.length > 0) throw new Error(requestBodyValidation.errors);

                if (!options?.headers) options.headers = {};
                options.headers["content-type"] = "application/json";

                const url = convertUrl("/user", params, query);

                const response = await this.instance({
                    method: "post",
                    url,
                    params,
                    data: body,
                    ...options,
                });

                resolve(response);

            } catch (error) {
                reject(error);
            }
        });
    }
    /**
     * POST /user/createWithList (Creates list of users with given input array)
     * @param {Object} args
     * @param {Object} args.params Path parameters
     * @param {Object} args.query Query parameters
     * @param {Object} args.body Request body
     * @param {Object} args.options Axios request options
     * @returns {Promise<Object>} Response
     */
    async createUsersWithListInput({
        params = {},
        query = {},
        body = {},
        options = {}
    }) {
        return new Promise(async (resolve, reject) => {
            try {
                const id = "/user/createWithList/post";

                const requestBodyValidation = this.validator.validate(body, {
                    id,
                    ...{
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {
                                    "type": "integer",
                                    "format": "int64",
                                    "example": 10
                                },
                                "username": {
                                    "type": "string",
                                    "example": "theUser"
                                },
                                "firstName": {
                                    "type": "string",
                                    "example": "John"
                                },
                                "lastName": {
                                    "type": "string",
                                    "example": "James"
                                },
                                "email": {
                                    "type": "string",
                                    "example": "john@email.com"
                                },
                                "password": {
                                    "type": "string",
                                    "example": "12345"
                                },
                                "phone": {
                                    "type": "string",
                                    "example": "12345"
                                },
                                "userStatus": {
                                    "type": "integer",
                                    "description": "User Status",
                                    "format": "int32",
                                    "example": 1
                                }
                            },
                            "xml": {
                                "name": "user"
                            }
                        }
                    }
                });

                if (requestBodyValidation?.errors?.length > 0) throw new Error(requestBodyValidation.errors);

                if (!options?.headers) options.headers = {};
                options.headers["content-type"] = "application/json";

                const url = convertUrl("/user/createWithList", params, query);

                const response = await this.instance({
                    method: "post",
                    url,
                    params,
                    data: body,
                    ...options,
                });

                resolve(response);

            } catch (error) {
                reject(error);
            }
        });
    }
    /**
     * GET /user/login (Logs user into the system)
     * @param {Object} args
     * @param {Object} args.params Path parameters
     * @param {Object} args.query Query parameters
     * @param {Object} args.body Request body
     * @param {Object} args.options Axios request options
     * @returns {Promise<Object>} Response
     */
    async loginUser({
        params = {},
        query = {},
        body = {},
        options = {}
    }) {
        return new Promise(async (resolve, reject) => {
            try {
                const id = "/user/login/get";
                const queryValidation = this.validator.validate(query, {
                    id,
                    ...{
                        "type": "object",
                        "properties": {
                            "username": {
                                "required": false,
                                "type": "string"
                            },
                            "password": {
                                "required": false,
                                "type": "string"
                            }
                        },
                        "required": []
                    }
                });

                if (queryValidation?.errors?.length > 0) throw new Error(queryValidation.errors);


                if (!options?.headers) options.headers = {};
                options.headers["content-type"] = "application/json";

                const url = convertUrl("/user/login", params, query);

                const response = await this.instance({
                    method: "get",
                    url,
                    params,
                    data: body,
                    ...options,
                });

                resolve(response);

            } catch (error) {
                reject(error);
            }
        });
    }
    /**
     * GET /user/logout (Logs out current logged in user session)
     * @param {Object} args
     * @param {Object} args.params Path parameters
     * @param {Object} args.query Query parameters
     * @param {Object} args.body Request body
     * @param {Object} args.options Axios request options
     * @returns {Promise<Object>} Response
     */
    async logoutUser({
        params = {},
        query = {},
        body = {},
        options = {}
    }) {
        return new Promise(async (resolve, reject) => {
            try {



                if (!options?.headers) options.headers = {};
                options.headers["content-type"] = "application/json";

                const url = convertUrl("/user/logout", params, query);

                const response = await this.instance({
                    method: "get",
                    url,
                    params,
                    data: body,
                    ...options,
                });

                resolve(response);

            } catch (error) {
                reject(error);
            }
        });
    }
    /**
     * GET /user/{username} (Get user by user name)
     * @param {Object} args
     * @param {Object} args.params Path parameters
     * @param {Object} args.query Query parameters
     * @param {Object} args.body Request body
     * @param {Object} args.options Axios request options
     * @returns {Promise<Object>} Response
     */
    async getUserByName({
        params = {},
        query = {},
        body = {},
        options = {}
    }) {
        return new Promise(async (resolve, reject) => {
            try {



                if (!options?.headers) options.headers = {};
                options.headers["content-type"] = "application/json";

                const url = convertUrl("/user/{username}", params, query);

                const response = await this.instance({
                    method: "get",
                    url,
                    params,
                    data: body,
                    ...options,
                });

                resolve(response);

            } catch (error) {
                reject(error);
            }
        });
    }
    /**
     * PUT /user/{username} (Update user)
     * @param {Object} args
     * @param {Object} args.params Path parameters
     * @param {Object} args.query Query parameters
     * @param {Object} args.body Request body
     * @param {Object} args.options Axios request options
     * @returns {Promise<Object>} Response
     */
    async updateUser({
        params = {},
        query = {},
        body = {},
        options = {}
    }) {
        return new Promise(async (resolve, reject) => {
            try {
                const id = "/user/{username}/put";

                const requestBodyValidation = this.validator.validate(body, {
                    id,
                    ...{
                        "type": "object",
                        "properties": {
                            "id": {
                                "type": "integer",
                                "format": "int64",
                                "example": 10
                            },
                            "username": {
                                "type": "string",
                                "example": "theUser"
                            },
                            "firstName": {
                                "type": "string",
                                "example": "John"
                            },
                            "lastName": {
                                "type": "string",
                                "example": "James"
                            },
                            "email": {
                                "type": "string",
                                "example": "john@email.com"
                            },
                            "password": {
                                "type": "string",
                                "example": "12345"
                            },
                            "phone": {
                                "type": "string",
                                "example": "12345"
                            },
                            "userStatus": {
                                "type": "integer",
                                "description": "User Status",
                                "format": "int32",
                                "example": 1
                            }
                        },
                        "xml": {
                            "name": "user"
                        }
                    }
                });

                if (requestBodyValidation?.errors?.length > 0) throw new Error(requestBodyValidation.errors);

                if (!options?.headers) options.headers = {};
                options.headers["content-type"] = "application/json";

                const url = convertUrl("/user/{username}", params, query);

                const response = await this.instance({
                    method: "put",
                    url,
                    params,
                    data: body,
                    ...options,
                });

                resolve(response);

            } catch (error) {
                reject(error);
            }
        });
    }
    /**
     * DELETE /user/{username} (Delete user)
     * @param {Object} args
     * @param {Object} args.params Path parameters
     * @param {Object} args.query Query parameters
     * @param {Object} args.body Request body
     * @param {Object} args.options Axios request options
     * @returns {Promise<Object>} Response
     */
    async deleteUser({
        params = {},
        query = {},
        body = {},
        options = {}
    }) {
        return new Promise(async (resolve, reject) => {
            try {



                if (!options?.headers) options.headers = {};
                options.headers["content-type"] = "application/json";

                const url = convertUrl("/user/{username}", params, query);

                const response = await this.instance({
                    method: "delete",
                    url,
                    params,
                    data: body,
                    ...options,
                });

                resolve(response);

            } catch (error) {
                reject(error);
            }
        });
    }
}
module.exports = Client;