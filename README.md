# Swagger API Client Builder

Automatically generate an API client on top of Axios using Swagger document.
Basically using the Swagger document to generate a client in reverse.

## Features

1. Create methods from operationIds and if not defined then it will fallback to `.get("/path/name/{id}")` / `.post("/path/name")`, etc...

2. Optionally it can use the Swagger schema for input validation.

3. Automatically converts the body to the correct content-type, but you can manually override it by defining the content-type in the axios request options.

4. If the protocol, host and base path are defined then it will use it as baseURL, but you can manually override it by defining the content-type in the axios request options.

5. Support for Swagger v2 and OpenAPI v3.

6. Can be installed as a global package and export a standalone API client via the CLI. (Only works if operationId is defined).

## Caveats

1. You can't use operationIds that are like method types (e.g "get", "post", "put", "delete", etc...) except if you export the client via the CLI.

## Install

```bash
npm install swagger-client-builder
```

### Or

```bash
yarn add swagger-client-builder
```

### CLI Usage (Only works if operationId is defined)

You can install the package globally using

```bash
npm i swagger-client-builder -g
```

And then run:

```bash
swagger-client-builder -i https://petstore3.swagger.io/api/v3/openapi.json -o /path/to/output.js -v true
```

#### Arguments

-i / --input = swagger file path or URL

-o / --output = Output js file

-v / --validation = true / false

## Code Example

```javascript
const SwaggerClientBuilder = require("swagger-client-builder");

async function main() {
    try {

        const swaggerFile = 'https://petstore3.swagger.io/api/v3/openapi.json'; // Or use file path

        const Client = new SwaggerClientBuilder(swaggerFile, {
            // Optional: Axios instance config
            baseURL: 'https://petstore3.swagger.io/api/v3'
        })

        await Client.build();

        // If operationId is defined in swagger

        const response = await Client.getPetById({
            params: { petId: 1 }
            /*
            query:{},
            body:{},

            // Axios request options
            options:{
                headers:{...}
            }
            */
        });

        console.log(response.data);

        // Or

        const response2 = await Client.get('/pet/{petId}', {
            params: {
                petId: 1,
            }
        });


        // You can also export the client to a file, but operationId is required in this case
        await Client.export('./client.js',{
            validation: true,
        });

    } catch (error) {
        console.log(error);
    }
}

main();
```
