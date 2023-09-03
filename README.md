# Swagger API Client Builder

Automatically generate an API client on top of Axios using Swagger document.

Basically using the Swagger document to generate a client in reverse.

## Features

* Uses operationIds for function names.

* Optionally it can use the Swagger schema for input validation.

* Automatically converts the body to the correct content-type, but you can manually override it by defining the content-type in the axios request options.

* If the protocol, host and base path are defined then it will use them as baseURL, but you can manually override it by defining the baseURL in the axios config.

* Supports Swagger v2 and OpenAPI v3.

* Can be installed as a global package and export a standalone API client via the CLI.

* CLI can export both JavaScript and TypeScript (extension detected from output path)

## Caveats

* **operationId** property is required for all paths.

## Install

```bash
npm install swagger-client-builder
```

### Or

```bash
yarn add swagger-client-builder
```

### CLI

You can install the package globally using:

```bash
npm i swagger-client-builder -g
```

#### Usage

```bash
usage: swagger-client-builder [-h] -i INPUT [-o OUTPUT] [-v VALIDATION] [-e ES] [-T TS] [-s SILENT] [-t TARGET] [-V]

Swagger Client Builder

optional arguments:
  -h, --help            show this help message and exit
  -i INPUT, --input INPUT
                        Input swagger file path or URL (.json or .yaml or .yml)
  -o OUTPUT, --output OUTPUT
                        Output file path (.js or .ts)
  -v VALIDATION, --validation VALIDATION
                        Add validation
  -e ES, --es ES        Use ES module import instead of CommonJs
  -T TS, --ts TS        Use TypeScript instead of JavaScript
  -s SILENT, --silent SILENT
                        Silent export (just export without prompts but will show errors)
  -t TARGET, --target TARGET
                        Target output ("file" or "bash")
  -V, --version         Show version
```

#### CLI Examples

##### Export to JavaScript with ES imports

```bash
swagger-client-builder --input https://petstore3.swagger.io/api/v3/openapi.json --output ./path/to/output.js --validation true --es true
```

##### Export to JavaScript with CommonJs requires

```bash
swagger-client-builder --input https://petstore3.swagger.io/api/v3/openapi.json --output ./path/to/output.js --validation true
```

##### Export to TypeScript

```bash
swagger-client-builder --input https://petstore3.swagger.io/api/v3/openapi.json --output ./path/to/output.ts --validation true --ts true
```

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


        // You can also export the client to a file from code
        await Client.export('./client.js',{
            validation: true,
        });

    } catch (error) {
        console.log(error);
    }
}

main();
```
