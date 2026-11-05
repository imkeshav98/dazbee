// The id of every record the API makes: short enough to read in a link.
import { customAlphabet } from 'nanoid'

/** 12 characters of lowercase letters and digits, from a secure random source. */
export const newId: () => string = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12)
