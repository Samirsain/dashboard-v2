import { dataService } from "../src/services/data.service";
import { sheetsConfig } from "../src/config/sheets.config";

async function run() {
  try {
    const users = await dataService.findAll(sheetsConfig.doers);
    console.log("Users in DB:");
    for (const u of users) {
      if (u.Role === "Admin" || u.Role === "MD") {
        console.log(`- MD User: ${u.Name} | Code: ${u["Employee Code"]} | ID: ${u["Doer ID"]}`);
      }
    }
  } catch (err) {
    console.error(err);
  }
}

run();
