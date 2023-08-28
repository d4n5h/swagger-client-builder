# swagger-client-builder

Automatically generates an API client on top of Axios using Swagger JSON document.
It uses the Swagger schema for input validation.
It will automatically gets the content-type from the requestBody and converts the body accordingly.

Install:

```bash
npm install swagger-client-builder
```

Or:

```bash
yarn add swagger-client-builder
```

Example:

```javascript
const SwaggerClientBuilder = require("swagger-client-builder"");
const axios = require("axios");
async function main() {
    try {
        const swaggerJson = await axios.get('https://petstore.swagger.io/v2/swagger.json');

        const Client = new SwaggerClientBuilder(swaggerJson.data, {
            // Optional: Axios instance config
            headers: {
                Authorization: "Bearer " + "<TOKEN>",
            },
        });

        const response = await Client.get('/pet/{petId}',{
            params: {
                petId: 1,
            },
            query:{
                order:'ASC'
            },
            body: {
                title: 'Example'
            },
            /*
            Optional: Axios request config
            options:{

            }
            */
        });

        console.log(response.data);
    } catch (error) {
        console.log(error);
    }
}

main();
```
