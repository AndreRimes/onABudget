var axios = require("axios");
var qs = require("qs");

class GmailAPI {
  accessToken = "";
  constructor() {
    this.accessToken = this.getAcceToken();
  }

  getAcceToken = async () => {
    var data = qs.stringify({
      client_id:
        "5431663462-jmm9qkstu4h2me7vnfouet33u75fc5n2.apps.googleusercontent.com",
      client_secret: "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",
      refresh_token:
        "1//05LrNRMRz-DJpCgYIARAAGAUSNwF-L9IrnPM0KkrXB4irm9BJxQr0qB74UgJYwWlKl-sJu3mDIkxOtjyzLarNq2Ejw7CViSwx77w",
      grant_type: "refresh_token",
    });
    var config = {
      method: "post",
      url: "https://accounts.google.com/o/oauth2/token",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: data,
    };

    let accessToken = "";

    await axios(config)
      .then(async function (response) {
        accessToken = await response.data.access_token;

        console.log("Access Token " + accessToken);
      })
      .catch(function (error) {
        console.log(error);
      });

    return accessToken;
  };

  searchGmail = async (searchItem) => {
    var config1 = {
      method: "get",
      url:
        "https://www.googleapis.com/gmail/v1/users/me/messages?q=" + searchItem,
      headers: {
        Authorization: `Bearer ${await this.accessToken} `,
      },
    };
    
    let messages = ''
    await axios(config1)
      .then(async function (response) {
        messages = await response.data["messages"];
        console.log(messages);
      })
      .catch(function (error) {
        console.log(error);
      });

      return messages;
  };

  readGmailContent = async (messageId) => {
    var config = {
      method: "get",
      url: `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
      headers: {
        Authorization: `Bearer ${await this.accessToken}`,
      },
    };

    var data = {};

    await axios(config)
      .then(async function (response) {
        data = await response.data;
      })
      .catch(function (error) {
        console.log(error);
        console.log('ERROR')
      });

    return data;
  };

  readInboxContent = async (searchText) => {
    const messages = await this.searchGmail(searchText);
    const emails = []
    for(let i = 0; i< messages.length; i++){
        console.log(messages[i].threadId)
        const message = await this.readGmailContent(messages[i].threadId);
        const encodedMessage = await message.payload.body.data
        const decodedStr = Buffer.from(encodedMessage, "base64").toString("ascii");
        console.log("EMAIL: ", decodedStr);
        emails.push(decodedStr);
    }

     return emails;
  };
}

module.exports = new GmailAPI();