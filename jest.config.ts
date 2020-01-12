import { Config } from "@jest/types";
import { TsJestGlobalOptions } from "ts-jest/dist/types";

interface JestConfig extends Partial<Config.InitialOptions> {
  globals: Config.ConfigGlobals & { "ts-jest": TsJestGlobalOptions };
}

const config: Partial<JestConfig> = {
  preset: "ts-jest",
  testMatch: ["**/?(*.)+(spec|test).[jt]s?(x)"],
  rootDir: "./src",
  globals: {
    "ts-jest": {
      diagnostics: false
    }
  }
};

module.exports = config;
