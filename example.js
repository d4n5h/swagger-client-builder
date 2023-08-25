const swaggerJson = require("./swagger.json");
const SwaggerApiClientBuilder = require("./index");

const builder = new SwaggerApiClientBuilder(swaggerJson, {
    baseURL: "http://localhost",
    headers: {
        Authorization: "Bearer " + "<TOKEN>", // Replace with your token
    },
});

const Client = builder.build();

async function main() {
    try {
        await Client.tenants['{tenantId}'].tickets['{ticketId}'].analyst_comment.post({
            params: {
                id: 1,
            },
            body: {
                title: 'Example'
            }
        });
    } catch (error) {
        console.log(error);
    }
}

main();
