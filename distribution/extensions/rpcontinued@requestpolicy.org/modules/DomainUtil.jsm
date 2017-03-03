/*
 * ***** BEGIN LICENSE BLOCK *****
 *
 * RequestPolicy - A Firefox extension for control over cross-site requests.
 * Copyright (c) 2008 Justin Samuel
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later
 * version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program. If not, see <http://www.gnu.org/licenses/>.
 *
 * ***** END LICENSE BLOCK *****
 */

/*
 * It's worth noting that many of the functions in this module will convert ACE
 * formatted IDNs to UTF8 formatted values. This is done automatically when
 * constructing nsIURI instances from ACE formatted URIs when the TLD is one in
 * which Mozilla supports UTF8 IDNs.
 */

var EXPORTED_SYMBOLS = ["DomainUtil"]

const CI = Components.interfaces;
const CC = Components.classes;

if (!requestpolicy) {
  var requestpolicy = {
    mod : {}
  };
}

Components.utils.import("resource://requestpolicy/Logger.jsm",
    requestpolicy.mod);

var DomainUtil = {};

DomainUtil._ios = CC["@mozilla.org/network/io-service;1"]
    .getService(CI.nsIIOService);

DomainUtil._eTLDService = CC["@mozilla.org/network/effective-tld-service;1"]
    .getService(CI.nsIEffectiveTLDService);

DomainUtil._idnService = CC["@mozilla.org/network/idn-service;1"]
    .getService(CI.nsIIDNService);

const STANDARDURL_CONTRACTID = "@mozilla.org/network/standard-url;1";

// LEVEL_DOMAIN: Use example.com from http://www.a.example.com:81
DomainUtil.LEVEL_DOMAIN = 1;
// LEVEL_HOST: Use www.a.example.com from http://www.a.example.com:81
DomainUtil.LEVEL_HOST = 2;
// LEVEL_SOP: Use http://www.a.example.com:81 from http://www.a.example.com:81
DomainUtil.LEVEL_SOP = 3;

DomainUtil.getIdentifier = function(uri, level) {
  var identifier;
  var identifierGettingFunctionName;
  switch (level) {
    case this.LEVEL_DOMAIN :
      identifierGettingFunctionName = "getDomain";
      break;
    case this.LEVEL_HOST :
      identifierGettingFunctionName = "getHost";
      break;
    case this.LEVEL_SOP :
      identifierGettingFunctionName = "getPrePath";
      break;
    default :
      throw "Invalid identifier level specified in DomainUtil.getIdentifier().";
  }

  try {
    identifier = this[identifierGettingFunctionName](uri);
  } catch (e) {
    // This will happen not infrequently with chrome:// and similar values
    // for the uri that get passed to this function.
    identifier = false;
  }

  if (identifier) {
    return identifier;
  } else {
    if (uri.indexOf("file://") == 0) {
      return "file://";
    } else if (uri.indexOf("data:") == 0) {
      // Format: data:[<MIME-type>][;charset=<encoding>][;base64],<data>
      var identifier = uri.split(",")[0];
      return identifier.split(";")[0];
    }
    requestpolicy.mod.Logger.info(requestpolicy.mod.Logger.TYPE_INTERNAL,
        "Unable to getIdentifier from uri " + uri + " using identifier level "
            + level + ".");
    return uri;
  }
};

DomainUtil.identifierIsInUri = function(identifier, uri, level) {
  return identifier == this.getIdentifier(uri, level);
};

/**
 * Returns the hostname from a uri string.
 *
 * @param {String}
 *          uri The uri.
 * @return {String} The hostname of the uri or throws an exception if it is an
 *         invalid uri.
 */
DomainUtil.getHost = function(uri) {
  return this.getUriObject(uri).host;
};

/**
 * Returns an nsIURI object from a uri string. Note that nsIURI objects will
 * automatically convert ACE formatting to UTF8 for IDNs in the various
 * attributes of the object that are available.
 *
 * @param {String}
 *          uri The uri.
 * @return {nsIURI} The nsIURI object created from the uri, or throws an
 *         exception if it is an invalid uri.
 */
DomainUtil.getUriObject = function(uri) {
  // Throws an exception if uri is invalid.
  return this._ios.newURI(uri, null, null);
};

/**
 * Determines whether a uri string represents a valid uri.
 *
 * @param {String}
 *          uri The uri.
 * @return {boolean} True if the uri is valid, false otherwise.
 */
DomainUtil.isValidUri = function(uri) {
  try {
    this.getUriObject(uri);
    return true;
  } catch (e) {
    return false;
  }
};


DomainUtil.isIPAddress = function(host) {
  try {
    this._eTLDService.getBaseDomainFromHost(host, 0);
  } catch (e) {
    if (e.name == 'NS_ERROR_HOST_IS_IP_ADDRESS') {
      return true;
    }
  }
  return false;
};


/**
 * Returns the domain from a uri string.
 *
 * @param {String}
 *          uri The uri.
 * @return {String} The domain of the uri.
 */
DomainUtil.getDomain = function(uri) {
  var host = this.getHost(uri);
  try {
    // The nsIEffectiveTLDService functions will always leave IDNs as ACE.
    var baseDomain = this._eTLDService.getBaseDomainFromHost(host, 0);
    // Note: we use convertToDisplayIDN rather than convertACEtoUTF8() because
    // we want to only convert IDNs that that are in Mozilla's IDN whitelist.
    // The second argument will have the property named "value" set to true if
    // the result is ASCII/ACE encoded, false otherwise.
    return DomainUtil._idnService.convertToDisplayIDN(baseDomain, {});
  } catch (e) {
    if (e.name == "NS_ERROR_HOST_IS_IP_ADDRESS") {
      return host;
    } else if (e.name == "NS_ERROR_INSUFFICIENT_DOMAIN_LEVELS") {
      return host;
    } else {
      throw e;
    }
  }
};

/**
 * Returns the path from a uri string.
 *
 * @param {String}
 *          uri The uri.
 * @return {String} The path of the uri.
 */
DomainUtil.getPath = function(uri) {
  return this.getUriObject(uri).path;
};

/**
 * Returns the prePath from a uri string. Note that this will return a prePath in
 * UTF8 format for all IDNs, even if the uri passed to the function is ACE
 * formatted.
 *
 * @param {String}
 *          uri The uri.
 * @return {String} The prePath of the uri.
 */
DomainUtil.getPrePath = function(uri) {
  return this.getUriObject(uri).prePath;
};

/**
 * Strips any "www." from the beginning of a hostname.
 *
 * @param {String}
 *          hostname The hostname to strip.
 * @return {String} The hostname with any leading "www." removed.
 */
DomainUtil.stripWww = function(hostname) {
  return hostname.indexOf('www.') == 0 ? hostname.substring(4) : hostname;
};

/**
 * Determine if two hostnames are the same if any "www." prefix is ignored.
 *
 * @param {String}
 *          destinationHost The destination hostname.
 * @param {String}
 *          originHost The origin hostname.
 * @return {Boolean} True if the hostnames are the same regardless of "www.",
 *         false otherwise.
 */
DomainUtil.sameHostIgnoreWww = function(destinationHost, originHost) {
  return destinationHost
      && this.stripWww(destinationHost) == this.stripWww(originHost);

};

DomainUtil.stripFragment = function(uri) {
  return uri.split("#")[0];
};

/**
 * Determine if the destination hostname is a subdomain of the origin hostname,
 * ignoring any "www." that may exist in the origin hostname. That is,
 * "images.example.com" is subdomain of both "www.example.com" and
 * "example.com", but "www.example.com " and "example.com" are not subdomains of
 * "images.example.com".
 *
 * @param {String}
 *          destinationHost The destination hostname.
 * @param {String}
 *          originHost The origin hostname.
 * @return {Boolean} True if the destination hostname is a subdomain of the
 *         origin hostname.
 */
DomainUtil.destinationIsSubdomainOfOrigin = function(destinationHost,
    originHost) {
  var destHostNoWww = this.stripWww(destinationHost);
  var originHostNoWww = this.stripWww(originHost);

  var lengthDifference = destHostNoWww.length - originHostNoWww.length;
  if (lengthDifference > 1) {
    if (destHostNoWww.substring(lengthDifference - 1) == '.' + originHostNoWww) {
      return true;
    }
  }
  return false;
};

// TODO: Maybe this should have a different home.
/**
 * Gets the relevant pieces out of a meta refresh or header refresh string.
 *
 * @param {String}
 *          refreshString The original content of a refresh header or meta tag.
 * @return {Array} First element is the delay in seconds, second element is the
 *         url to refresh to. The url may be an empty string if the current url
 *         should be refreshed.
 * @throws Generic
 *           exception if the refreshString has an invalid format, including if
 *           the seconds can't be parsed as a float.
 */
DomainUtil.parseRefresh = function(refreshString) {
  var parts = /^\s*(\S*?)\s*(;\s*url\s*=\s*(.*?)\s*)?$/i.exec(refreshString);
  var delay = parseFloat(parts[1]);
  if (isNaN(delay)) {
    throw "Invalid delay value in refresh string: " + parts[1];
  }
  var url = parts[3];
  if (url == undefined) {
    url = '';
  }
  // Strip off enclosing quotes around the url.
  if (url) {
    var first = url[0];
    var last = url[url.length - 1];
    if (first == last && (first == "'" || first == '"')) {
      url = url.substring(1, url.length - 1);
    }
  }
  return [delay, url];
}

/**
 * Adds a path of "/" to the uri if it doesn't have one. That is,
 * "http://127.0.0.1" is returned as "http://127.0.0.1/". Will return the origin
 * uri if the provided one is not valid.
 *
 * @param {String}
 *          uri
 * @return {String}
 */
DomainUtil.ensureUriHasPath = function(uri) {
  try {
    return this.getUriObject(uri).spec;
  } catch (e) {
    return uri;
  }
}

/**
 * Returns the same uri but makes sure that it's UTF8 formatted instead of ACE
 * formatted if it's an IDN that Mozilla supports displaying in UTF8 format. See
 * http://www.mozilla.org/projects/security/tld-idn-policy-list.html for more
 * info.
 *
 * @param {String}
 *          uri The uri.
 * @return {nsIURI} The same uri but with UTF8 formatting if the original uri
 *         was ACE formatted.
 */
DomainUtil.formatIDNUri = function(uri) {
  // Throws an exception if uri is invalid. This is almost the same as the
  // ensureUriHasPath function, but the separate function makes the calling
  // code clearer and this one we want to raise an exception if the uri is
  // not valid.
  return this.getUriObject(uri).spec;
};

/**
 * Given an origin URI string and a destination path to redirect to, returns a
 * string which is a valid uri which will be/should be redirected to. This
 * takes into account whether the destPath is a full URI, an absolute path
 * (starts with a slash), a protocol relative path (starts with two slashes),
 * or is relative to the originUri path.
 *
 * @param {String}
 *          originUri
 * @param {String}
 *          destPath
 * @return {String}
 */
DomainUtil.determineRedirectUri = function(originUri, destPath) {
  var baseUri = this.getUriObject(originUri);
  var urlType = CI.nsIStandardURL.URLTYPE_AUTHORITY;
  var newUri = CC[STANDARDURL_CONTRACTID].createInstance(CI.nsIStandardURL);
  newUri.init(urlType, 0, destPath, null, baseUri);
  var resolvedUri = newUri.QueryInterface(Components.interfaces.nsIURI);
  return resolvedUri.spec;
}
