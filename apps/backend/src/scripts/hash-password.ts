import argon2 from 'argon2';
const password = process.argv[2];
if (!password) {
  process.stderr.write('Usage : pnpm hash-password "votre-mot-de-passe"\n');
  process.exitCode = 1;
} else
  process.stdout.write(
    `${await argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 })}\n`,
  );
