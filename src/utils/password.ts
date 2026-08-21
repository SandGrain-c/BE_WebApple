import bcrypt from "bcrypt";

export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_HASH_ROUNDS = 10;

export const isValidPassword = (password: string) => {
  return password.length >= PASSWORD_MIN_LENGTH;
};

export const hashPassword = (password: string) => {
  return bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
};
