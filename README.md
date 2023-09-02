# Swagger API Client Builder

Automatically generate an API client on top of Axios using Swagger document.
Basically using the Swagger document to generate a client in reverse.

1. It uses the Swagger schema for input validation and it resolves all the schema references.

2. It automatically gets the content-type from the requestBody and converts the body accordingly, if there's no content-type to the requestBody then it will fallback to JSON.

3. If operationIds are defined, it will use them as method names, or you can use `.get("/path/name/{id}")` / `.post("/path/name")`, etc...

4. It will try to resolve the protocol, host and base path. But if the Swagger document doesn't contain them then you'll need to define them in the axios config.

5. Don't use operationIds that are like method types (e.g "get", "post", "put", "delete", etc...)

6. Currently it supports Swagger v2 and OpenAPI v3.

7. If operationId is defined for paths then you can also export the client as a standalone file using the `export()` function or use the CLI (example provided in this readme).

## Install

```bash
npm install swagger-client-builder
```

### Or

```bash
yarn add swagger-client-builder
```

## Example

```javascript
const SwaggerClientBuilder = require("swagger-client-builder");

async function main() {
    try {

        const swaggerFile = 'https://petstore3.swagger.io/api/v3/openapi.json'; // Or use file path

        const Client = new SwaggerClientBuilder(swaggerFile, {
            // Optional: Axios instance config
            baseURL: 'https://petstore3.swagger.io/api/v3'
        })

        const client = await Client.build();

        // If operationId is defined in swagger

        const response = await client.getPetById({
            params: { petId: 1 },
        });

        console.log(response.data);

        // Or

        const response2 = await client.get('/pet/{petId}', {
            params: {
                petId: 1,
            },
            /*
            query:{},
            body:{},
            options:{
                // Axios request options
                headers:{...}
            }
            */
        });


        // You can also export the client to a file, but operationId is required in this case
        await client.export('./client.js',{
            validation: true,
        });

    } catch (error) {
        console.log(error);
    }
}

main();
```

### Export from CLI (Only works if operationId is defined)

You can install the package globally using

```bash
npm i swagger-client-builder -g
```

And then run:

```bash
swagger-client-builder -i ./path/to/swagger.json -o ./path/to/output.js -v true
```

#### Arguments

-i / --input = swagger file path or URL

-o / --output = Output js file

-v / --validation = true / false
