
export const DisplayNameValidationString = "Display Names must consist of between 3 and 30 characters, which can consist of letters, numbers, dashes, and underscores.";
export const validateDisplayName = (name: string) => /^[a-zA-Z0-9_-]{3,30}$/.test(name);

export const MaxTotalImageMB = 30;
export const MaxIndividualImageMB = 10;

export const BackblazeDomain = "https://chainmaker-uploads.s3.us-east-005.backblazeb2.com";