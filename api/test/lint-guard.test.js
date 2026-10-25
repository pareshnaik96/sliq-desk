import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();
const restricted = async (filePath, code) => {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((m) => m.ruleId === 'no-restricted-imports');
};

const importMongoose = "import mongoose from 'mongoose';\n";
const importModels = "import { Ticket } from '../models/index.js';\n";
const importModelFile = "import { Ticket } from '../models/ticket.model.js';\n";

describe('tenant isolation lint guard', () => {
  it('forbids importing mongoose or models outside repositories', async () => {
    expect(await restricted('src/services/x.js', importMongoose)).toHaveLength(1);
    expect(await restricted('src/routes/x.js', importModels)).toHaveLength(1);
    expect(await restricted('src/jobs/x.js', importModelFile)).toHaveLength(1);
  });

  it('allows it inside repositories', async () => {
    expect(await restricted('src/repositories/x.js', importModels)).toHaveLength(0);
    expect(await restricted('src/repositories/x.js', importMongoose)).toHaveLength(0);
  });
});
