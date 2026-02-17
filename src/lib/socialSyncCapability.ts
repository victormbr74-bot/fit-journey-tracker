let socialGlobalStateAvailable = true;

export const isSocialGlobalStateAvailable = () => socialGlobalStateAvailable;

export const disableSocialGlobalState = () => {
  socialGlobalStateAvailable = false;
};

export const enableSocialGlobalState = () => {
  socialGlobalStateAvailable = true;
};
