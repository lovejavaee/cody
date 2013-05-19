//
// Johan Coppieters - jan 2013 - jWorks
//
//
var mysql = require('mysql');
var cody = require('./index.js');

console.log("loading " + module.id);


/* One off object for making roots for Globals and General */

function Root(controller, id, name) {
  var myRoot = controller.getObject(id);
  var myChildren = myRoot.getChildren();
  
  this.getId = function() { return id; };
  this.getName = function() { return name; };
  this.hasChildren = function() { return (myChildren.length > 0); };
  this.getChildren = function() { return myChildren; };
 }
 

/* Actual SitemapController */

function SitemapController(context) {
  // only called for using my methods
  console.log("SitemapController.constructor -> page(" + context.page.itemId + ") = " + context.page.title + ", request = " + context.request);
  
  // init inherited controller
  cody.TreeController.call(this, context);
}

SitemapController.prototype = Object.create( cody.TreeController.prototype );
// needed?  SitemapController.prototype.constructor = SitemapController;

module.exports = SitemapController;



SitemapController.prototype.doRequest = function( finish ) {
  var self = this;
  
  console.log("sitemap constructor name = " + this.constructor.name);
  
  self.context.fn = "cms/sitemap.ejs";
  
  if (self.isRequest("realdelete")) {
    self.realDelete( self.getParam("node"), function whenDone(result) {
      if (result.status != "OK") { 
        self.feedBack(false, "Something went wrong during delete."); 
      }
      finish();
    });
    
    
  } else if (self.isRequest("savedata")) {
    self.saveData( self.getParam("node"), self.getParam("id"), finish);

    
  } else if (self.isRequest("addcontent")) {
    self.addContent( self.getParam("node"), self.getParam("kind"), function(newId) {
      finish( { status: "OK", id: newId } );
    });

    
  } else if (self.isRequest("deletecontent")) {
    self.deleteContent( self.getParam("node"), self.getParam("id"), function() {
      finish( { status: "OK" } );
    });

    
  } else if (self.isRequest("adjust")) {
    self.adjustElements( self.getParam("node"), function whenDone(result) {
      // get all info and data on this node
      self.setRequest("getnode");
      cody.TreeController.prototype.doRequest.call(self, finish);
    });

    
  } else {
    // super.doRequest
    cody.TreeController.prototype.doRequest.call(self, finish);
    
  }
};



/* Overridden - Config functions */
SitemapController.prototype.getRoot = function() {
  return cody.Application.kHomePage;
};

SitemapController.prototype.getType = function(theNode) { 
  return ""; 
};
SitemapController.prototype.getFolder = function() { 
  return ""; 
};
SitemapController.prototype.getObject = function(id) {
  var language = this.context.page.language;  
  return this.app.getPage(language, id);
};

/* SitemapController - Specific actions */

SitemapController.prototype.saveData = function(thePage, theId, finish) {    
  var self = this;
  
  var aPage = self.getObject( cody.TreeController.toId(thePage) );
  var aContentId = cody.TreeController.toId(theId);
  
  console.log("Received SitemapController - saveData, pageId = " + thePage + ", contentId = " + aContentId);
  try {
    
    if (! self.isAllowed(aPage.item)) {
      finish( { status: "NAL" } );
      return;
    }
    
    var aContent;
    if (aContentId !== 0) {
      aContent = aPage.getContent(aContentId);
    } else {
      aContent = new cody.Content({item: aPage.item.id}, aPage, self.app);
    }
    aContent.scrapeFrom(self, thePage, aPage.item.id);
    
    aContent.doUpdate(self, (aContentId === 0), function(err) {
      if (err) {
        finish( { status: "NOK", error: err } );
      } else {
        finish( { status: "OK" } );
      }
    });
    
    
  } catch (e) {
    console.log(e);
    console.log("SitemapController.SaveData: failed to save the content of page " + thePage + " with id = " + theId);

    finish( { status: "NOK", error: e } );
  }
};

/* Overridden - Action functions */

SitemapController.prototype.addObject = function( title, refNode, type, kind, finish ) {
    var self = this;
    console.log("Received SitemapController - addObject, refnode = " + refNode + ", type = " + type);
    
    var refNodeId = cody.TreeController.toId(refNode);
    var orderNr, aParent;

    // fetch the user id
    var userId = this.getLoginId();
    
    // fetch the parent and sortorder
    if (type == "inside") {
      orderNr = 5;
      aParent = self.app.getItem(refNodeId);
    } else { 
      // after -> is always at the end -> we never get this !! (worked with previous version of jsTree)
      var refItem = self.app.getItem(refNodeId);
      orderNr = refItem.sortorder + 10;
      aParent = refItem.parent;
    }
    
    // can we make modifications to this parent node
    if (! self.isAllowed(aParent)) {
      finish( { status: "NAL" } );
      return;
    }
    
    // make the item
    var basis = cody.Item.addDefaults({name: title, user: userId, sortorder: orderNr}, aParent);
    var anItem = new cody.Item(basis, self.app);
    
    try {
      anItem.doUpdate(self, function() {
        // we need the id of the new item, so use the callback
        self.app.addItem(anItem);
          
        // make the page in all languages
        var langs = self.app.getLanguages();
 
        cody.Application.each( langs, function makePageForLanguage(done) {
          // iterator over all languages
          basis = cody.Page.addDefaults({language: this.id}, anItem);
          var aPage = new cody.Page(basis, self.app);
            
          aPage.doUpdate(self, function() {
              self.app.addPage(aPage);
              aPage.adjustContent(self, done);
          }, true);
          
        }, function whenDone(err) {
          // terminator
          
          if (err) {
            finish( { status: "NOK", error: err } );
            
          } else {
            //TODO: add default elements from template and insert in the database
            //aContent.FetchElements(aPage.fLanguage, - aDefaultTemplateId);
            //aContent.doInsertElements();
          
            finish( { status: "OK", node: "id_" + anItem.id } );
          }
        });
      });
        
    } catch (e) {
      console.log("SiteMapController.AddPage: Failed to create the Item or Page objects.");
      console.log(e);
      finish( { status: "NOK", error: e } );
    }
};


SitemapController.prototype.moveObject = function( nodeId, refNode, type, finish ) {
  // type = "before", "after" or "inside"
  console.log("Received SitemapController - moveObject, refnode = " + refNode + 
              ", node = " + nodeId + ", type = " + type);
  
  var orderNr;
  var aParent;
  
  // fetch the parent and insertion point
  if (type == "inside") {
    aParent = this.app.getItem(cody.TreeController.toId(refNode));
    orderNr = 9999;
  } else {  
    var refItem = this.app.getItem(cody.TreeController.toId(refNode));
    aParent = this.app.getItem(refItem.parentId);
    orderNr = refItem.sortorder + ((type == "before") ? -5 : +5);
  }
  
  // fetch the node to be moved
  var anItem = this.app.getItem(cody.TreeController.toId(nodeId));
  var curParent = this.app.getItem(anItem.parentId);
  
  // check the new target parent
  if (! this.isAllowed(aParent)) {
    finish( { status: "NAL" } );
    return;
  }
  
  // check the current parent
  if (! this.isAllowed(curParent)) {
    finish( { status: "NAL" } );
    return;
  }
  
    
  // position in the tree
  anItem.parentId = aParent.id;
  console.log("SiteMapController.MovePage: old order = " + anItem.sortorder + ", new order = " + orderNr);
  anItem.sortorder = orderNr;
  
  try {
    // anItem.doUpdate(this); -> done in respace too, so no need to call it here
    this.app.buildSitemap();
    
    this.respace(aParent, function whenDone() {
      finish( { status: "OK" } );
    });
    
  } catch (e) {
    console.log("SiteMapController.MovePage: Failed to update the Item object.");
    console.log(e);
    finish( { status: "NOK", error: e.toString() } );
  }
};


SitemapController.prototype.renameObject = function( title, nodeId, finish ) {
  var self = this;
  console.log("Received SitemapController - renameObject, node = " + nodeId + ", title = " + title);
      
  var aPage = self.getObject( cody.TreeController.toId(nodeId) );
  if (aPage) {
      
    if (! self.isAllowed(aPage.item)) {
      finish( { status: "NAL" } );
      return;
    }

    aPage.title = title;
  
    try {
      aPage.doUpdate(self, function() {
        
       // perhaps overkill but for (sortorder == alphabetical) the order of pages can change
       self.app.buildSitemap();
       
       // rename the item if it's the page of the default language (although item names are not shown)
       if ((self.app.isDefaultLanguage(aPage.language)) || (aPage.item.name == cody.Item.kDefaultName)) {
          aPage.item.name = title;
          aPage.item.doUpdate(self, function() {
            finish( { status: "OK" } );
          });
        } else {
          finish( { status: "OK" } );
        }
      });
      
      
    } catch (e) {
      console.log("SiteMapController.RenameObject: Failed to update the Page or Item object.");      
      finish( {status: "NOK", error: e } );
    }
    
  } else {
    finish( {status: "NOK", error: "page not found" } );
  }
};


SitemapController.prototype.realDelete = function( node, finish ) {
  var self = this;
  
  console.log("Received SitemapController - realdelete, node = " + node);
  
  //request to delete a node from the tree
  var aPage = self.getObject( cody.TreeController.toId(node) );
  var anItem = aPage.item;
  
  // if needed, show this node after the delete
  self.context.shownode = anItem.parentId;
  
  if (! self.isAllowed(anItem)) {
    finish( { status: "NAL" } );
    return;
  }
  
  if (aPage.hasChildren()) {
    finish( { status: "NOE" } );
    return;
  }
  
  try {
    anItem.doDelete(self, function() {
      finish( { status: "OK" } );
    });
    
  } catch(e) {
    console.log("SiteMapController.RealDelete: Failed to delete the Page object -- " + e);  
    finish( { status: "NOK", error: e } );
  }
};


SitemapController.prototype.deleteObject = function( nodeId, finish ) {
  var self = this;
  
  // for pages, this function only de-activates the item
  console.log("Received SitemapController - deleteObject, node = " + nodeId);
  
  try {
    var aPage = self.getObject( cody.TreeController.toId(nodeId) );
    
    if (! self.isAllowed(aPage.item)) {
      finish( { status: "NAL" } );
      return;
    }

    aPage.doDeactivate(self, function() {
      finish( { status: "OK" } );
    });

    
  } catch (e) {
    console.log("SiteMapController.DeletePage: Failed to delete the Page object -- " + e);  
    finish( { status: "NOK", error: e } );
  }
};



SitemapController.prototype.fetchNode = function( theNode ) {
  var self = this;
  
  var aPage = self.getObject( cody.TreeController.toId(theNode) );
  if (! self.isAllowed(aPage.item)) { return {status: "NAL"}; }
  
  // just switch the page in our current context and we're done ??
  self.context.page = aPage;
  
  //TODO: get all the (main) content blocks connected to this page
  // for the moment they are all there from startup
  // question? how do I get rid of all the (main) blocks -- we keep the (intro) blocks

  
  console.log("SitemapController.FetchNode: node = " + theNode + " + language = " + aPage.language + " => " + self.context.page.item.id);

};

SitemapController.prototype.saveInfo = function( nodeId, finish ) {
	var self = this;
	
  var aPage = self.getObject( cody.TreeController.toId(nodeId) );
  var anItem = aPage.item;

  anItem.scrapeFrom(self);
  anItem.doUpdate(self, function() {

    aPage.scrapeFrom(self);
    aPage.doUpdate(self, function() {

      aPage.updateContent(self, function() {

        // sortBy attributes can be changed
        self.app.buildSitemap();
        
        // signal node to be selected in the tree view
        self.context.shownode = anItem.id;
        
        finish();
      });
    });
  });
 };



/* Controller specific, called from template */

SitemapController.prototype.getDashboardTree = function() {
  return this.getTree( new Root(this, cody.Application.kDashboardPage, "Dashboard") );
};

SitemapController.prototype.getOrphansTree = function() {
  return this.getTree( new Root(this, cody.Application.kOrphansPage, "Pages") );
};


/* content stuff */

SitemapController.prototype.adjustContent = function( theNode, finish ) {
  var self = this;
  console.log("SiteMapController.adjustContent: add correct Content for " + theNode + "");

  var aPage = self.getObject( cody.TreeController.toId(theNode) );
  aPage.adjustContent( self, function() {
    self.context.savedPage = aPage;
    self.context.fetchnode = "id_" + aPage.itemId;
    finish();
  });
};


SitemapController.prototype.addContent = function( theNode, theKind, finish ) {
  var self = this;
  console.log("SiteMapController.addContent: " + theKind + ", for " + theNode + "");
  
  var aPage = self.getObject( cody.TreeController.toId(theNode) );
  aPage.addContent( self, theKind, function(newId) {
    finish(newId);
  });
};

SitemapController.prototype.deleteContent = function( theNode, theId, finish ) {
  var self = this;
  console.log("SiteMapController.deleteContent: delete content " + theId + ", for " + theNode + "");
  
  var aPage = self.getObject( cody.TreeController.toId(theNode) );
  aPage.deleteContentById(self, cody.TreeController.toId(theId), function() {
    finish();
  });
};

/* SitemapController utilities */

SitemapController.prototype.respace = function( parent, finish ) {
	var self = this;
	
  // Find all children, any page of the item will do, they all have the same children in any language
  var aPage = this.getObject(parent.id);

  var nr = 0;
  cody.Application.each(aPage.children, function respaceOnePage(done) {
    var aChildPage = this;
    nr += 10;
    console.log("SiteMapController.Respace: checking '" + aChildPage.item.name + "' now = " + aChildPage.item.sortorder + " to " + nr);
    if (aChildPage.item.sortorder != nr) {
      aChildPage.item.sortorder = nr;
      aChildPage.item.doUpdate(self, function() {
        done();
      });
    } else {
      done();
    }
    
  }, function whenDone(err) {
    if (err) { console.log("SitemapController - respace: error = " + err); }
    if (typeof finish == "function") { finish(); }
    
  });

};


SitemapController.prototype.isAllowed = function( theNode ) {
  var aUserDomain = this.getLogin().getDomain();
  var anItemDomain = theNode.getAllowedGroups();
  
  console.log("TSiteMapController.isAllowed: user = '" + aUserDomain + "', item = '" + anItemDomain + "'");

  if (aUserDomain.length === 0) { return false; }
  if ((aUserDomain=="*") || (aUserDomain=="rWorks")) { return true; }
    
  if ((anItemDomain.equals=="*") || (anItemDomain.length === 0)) { return true; }
  
  var aList = anItemDomain.split(",");
  for (var x in aList) {
    if (aList[x]==aUserDomain) { 
      return true; 
    }
  }
  
  return false;
};
