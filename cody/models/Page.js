//
// Johan Coppieters - jan 2013 - jWorks
//
//
console.log("loading " + module.id);

var cody = require("./../index.js");


function Page(basis, app) {
  // copy from basis
  for (var a in basis) {
    if (basis.hasOwnProperty(a)) {
      this[a] = basis[a];
    }
  }

  // replace 'item' (an id) by the real object and add 'itemId'
  this.itemId = this.item;
  this.item = app.getItem(this.itemId);
  if (typeof this.item === "undefined") {
    app.err("Application.fetchPages", "did not find item for page " + this.itemId + " / " + this.title);
  }
}
module.exports = Page;


Page.addDefaults = function(basis, item) {
  
  if (typeof item === "undefined") { item = {}; }
  
  basis.item = basis.item || item.id;
  basis.language = basis.language || cody.Application.kDefaultLanguage;
  
  basis.title = basis.title || item.name || cody.Item.kDefaultName;
  basis.created = basis.created || new Date();
  basis.updated = basis.updated || new Date();
  basis.link = basis.link || "";
  basis.keywords = basis.keywords || "";
  basis.description = basis.description || "";
  basis.active = basis.active || "Y";
  basis.content =  basis.content || [];
  
  return basis;
};

Page.loadPages = function(connection, store) {
  connection.query('select * from pages', [], function(err, result) {
    if (err) { console.log(err); throw(new Error("Page.loadPages failed with sql errors")); }
    store(result);
  });
};
Page.loadLanguages = function(connection, store) {
  connection.query('select * from languages order by sortorder', [], function(err, result) {
    if (err) { console.log(err); throw(new Error("Page.loadLanguages failed with sql errors")); }
    store(result);
  });
};


Page.prototype.addTo = function(app) {
  // add to the list of all pages
  app.pages.push(this);
  
  // build url with its unique id (no check needed) and store in the hashmap
  this.url = this.language + "/" + this.itemId;
  app.urls[this.url] = this;
  
  if (! this.setLink(this.link, app, true) ) {
    throw new Error("Application.fetchPages - double link: " + this.url);
  }
};

Page.prototype.setLink = function(link, app, isNew) {
  // if we have a user defined link, store it in the url field as well in the app's url hashmap
  
  // delete the current link from the app's hashmap
  if (isNew !== true) {
    if ((typeof this.link !== "undefined") && (this.link !== "")) {
      delete app.urls[this.language + "/" + this.link];
    }
  }
  
  if (link !== '') {
    // check if this link is not already used
   if (isNew === true) {
      if (app.urls[this.language + "/" + link]) {
        console.log("Page.setLink -> " + this.language + "/" + link + " already used");
        return false;
      }
    }
    // replace the page its url by something better (than "language/id")
    var url = this.language + "/" + link;
    
    app.urls[url] = this;
    this.url = url;
  }
  this.link = link;
  return true;
};


Page.prototype.addRoot = function() {
  function goUp(aPage) {
    //console.log("goUp: " + aPage.item.id + " -> " + aPage.item.parentId);
    if (aPage.item.parentId < 0) {
      return aPage;
    } else {
      return goUp(aPage.parent);
    }
  }
  //console.log("AddRoot: " + this.itemId);
  this.root = goUp(this);
};


Page.prototype.addChildren = function(list) {
  
  // loop through all pages and find pages having my parent id and language
  this.children = [];
  for (var i = 0; i < list.length; i++) {
    if ((list[i].item.parentId === this.itemId) && (list[i].language === this.language)) {
      // parent and language match -> add to my children
      this.children.push(list[i]);
      
      // this is done more than once... better solution?
      list[i].parent = this;
    }
  }
  if (this.children.length > 1) {
    this.sortChildren(this.item.orderby);
    // console.log("Page.addChildren -> sorted children of " + this.title + " -> " + this.item.orderby);
    // for(var i in this.children) console.log(" " + this.children[i].item.sortorder + ". " + this.children[i].title);
  }
};

Page.prototype.sortChildren = function(order) {
  var kEqual = 0; // kBefore = -1, kAfter = 1;
  
  this.children.sort( function(a, b) {
    if (a === b) {
      return kEqual;
    }
      
    if (order === cody.Item.kAlphabetical) {
      return a.title.localeCompare(b.title);
    }
      
    if (order === cody.Item.kDate) {
      return b.item.dated.getTime() - a.item.dated.getTime();
    }
      
    if (order === cody.Item.kManual) {
      return a.item.sortorder - b.item.sortorder;
    }
    
    console.log("Page.sortChildren -> We should't be here... orderby = " + order);
    return kEqual;
  });
};



Page.prototype.getController = function(context) {
  return this.item.template.getController(context);
};
Page.prototype.getView = function() {
  return this.item.template.getView();
};

Page.prototype.getDisplay = function() {
  // check if this page is marked as: "show first subitem"
  if ((this.item.showcontent === cody.Item.kSubItem) && (this.children.length > 0)) {
    return this.children[0].getDisplay();
  } else {
    return this;
  }
};

Page.prototype.shortString = function() {
  return  this.title + " ("+ this.item.id + "/" + this.item.parentId + "), order = " + this.item.orderby +
          ", content = " + this.nrContent() + ", size = " + this.contentLength() + " bytes";
};

Page.prototype.needsLogin = function() {
  return (this.item) && (this.item.needslogin === "Y");
};


//
// Tree interface requirements
//
Page.prototype.getAllowedGroups = function() {
  return this.item.getAllowedgroups();
};
Page.prototype.hasChildren = function() {
  return (this.children.length > 0);
};
Page.prototype.isActive = function() { 
  return (this.active === 'Y');
};
Page.prototype.isVisible = function() { 
  var now = new Date();
  return (this.active === 'Y') && (this.item.validfrom <= now) && (this.item.validto >= now);
};

Page.prototype.getChildren = function() {
  return this.children;
};
Page.prototype.getSortOrder = function() {
  return this.item.sortorder;
};
Page.prototype.setSortOrder = function(nr) {
  this.item.sortorder = nr;
};

Page.prototype.getName = function() {
  return this.title;
};
Page.prototype.setName = function(name) {
  this.title = name;
};
Page.prototype.getId = function() {
  return this.item.id;
};

Page.prototype.getKind = function(kind) {
  var result = [];
  for (var ic in this.content) { 
    if (this.content[ic].kind === kind) {
      result.push(this.content[ic]);
    }
  }
  return result;
};


/* Page utilities */

Page.prototype.scrapeFrom = function(controller) {
  var self = this;
  // get all page info from the controller
  self.title = controller.getParam("title", self.title); 
  self.active = controller.getParam("active", "N"); 
  self.keywords = controller.getParam("keywords", "");
  self.description = controller.getParam("description", "");
  self.setLink(controller.getParam("link"), controller.app, false);
  
  // missing: updated (automatically on doUpdate), created (invariable), language (invariable)
};

Page.prototype.doUpdate = function(controller, next, isNew) {
  var self = this;
  var values = [self.title, self.link, self.active, self.keywords, self.description, self.itemId, self.language];
  
  // new or existing record?
  if (isNew) {
    // console.log("Page.doUpdate -> insert page " + self.title);
    controller.query("insert into pages (title, link, active, keywords, description , updated, created, item, language) " +
                     "values (?, ?, ?, ?, ?, now(), now(), ?, ?)", values,
    function(err, result) {
      if (err) { 
        console.log("Page.doUpdate -> error inserting page: " + self.language + "/" + self.itemId);
        console.log(err); 
      } else {
        console.log("Page.doUpdate -> inserted page: " + self.language + "/" + self.itemId);
        self.created = self.updated = new Date();
      }
      if (typeof next === "function") { next(); }
    });
    
  } else {
    //  console.log("Page.doUpdate -> update page " + self.itemId + " - " + self.title);
    controller.query("update pages set title = ?, link = ?, active = ?, keywords = ?, description = ?, updated = now() " +
                     " where item = ? and language = ?", values,
    function(err) {
      if (err) { 
        console.log("Page.doUpdate -> error updating page: " + self.language + "/" + self.itemId);
        console.log(err); 
      } else {
        console.log("Page.doUpdate -> updated page: " + self.language + "/" + self.itemId);
        self.updated = new Date();
      }
      if (typeof next === "function") { next(); }
    });
  }
};

Page.prototype.doDelete = function(controller, next) {
	var self = this;

  // should NOT be used !!
  console.log("ERROR: should not be used -- delete page " + self.language + "/" + this.item.id + " - " + this.title);
  controller.query("delete from pages where item = ? and language = ?",
      [self.itemId, self.language],
      function(err) {
        if (err) { 
          console.log(err); 
        } else {
          console.log("Page.doDelete -> deleted page: " + self.language + "/" + self.itemId);
        }
        if (typeof next === "function") { next(); }
  });
};

Page.prototype.doDeactivate = function(controller, next) {
  var self = this;
  console.log("Page.doDeactivate -> deactive page " + self.language + "/" + self.itemId + " - " + self.title);
  this.active = 'N';
  controller.query("update pages set active = 'N' where item = ? and language = ?",
      [self.itemId, self.language],
      function(err) {
        if (err) { 
          console.log(err); 
        } else {
          console.log("Page.doDeactivate -> deactived page: " + self.language + "/" + self.itemId);
        }
        if (typeof next === "function") { next(); }
  });
};


/* Content stuff */

Page.prototype.getContent = function(id) {
  var i = this.getContentIndex(id);
  if (i >= 0) {
    return this.content[i];
  }
  return null;
};
Page.prototype.getContentIndex = function(id) {
  for (var ic = 0; ic < this.content.length; ic++) {
    if (this.content[ic].id == id) {
      return ic;
    }
  }
  return -1;
};


Page.prototype.nrContent = function() {
  return (typeof this.content !== "undefined") ?  0 : this.content.length;
};


Page.prototype.contentLength = function() {
  if (typeof this.content === "undefined") { return 0; }
  var total = 0;
  this.content.forEach( function (c) { total += c.contentLength(); });
  return total;
};


Page.prototype.sortContent = function() {
  this.content.sort( function(a, b) {
     if (a.intro === b.intro) {
      return (a.sortorder - b.sortorder);
     } else if (a.intro === 'Y') {
       return -1;
     } else {
       return 1;
     }
    });
};


Page.prototype.loadContent = function(app, next) {
  this.fetchContent(app, this.language, this.itemId, next);
};


Page.prototype.deleteContentById = function( controller, theId, next ) {
  var self = this;
  
  var i = self.getContentIndex(theId);
  if (i > 0) {
    controller.query("delete from content where id=?", [theId], function(err) {
      if (err) { 
        console.log(err); 
      } else {
        self.content.splice(i, 1);
        console.log("Page.deleteContentById -> deleted content " + theId + ", on: " + i + ", of: " + self.language + "/" + self.itemId);
      }
      if (typeof next === "function") { next(); }
    });  
  } else {
    console.log("Page.deleteContentById: " + theId + " not found on " + self.language + "/" + self.itemId);
    if (typeof next === "function") { next(); }
  }
};


Page.prototype.deleteContent = function( controller, next ) {
  var self = this;
  
  controller.query("delete from content where item=? and language=?", 
      [self.itemId, self.language], function(err) {
    if (err) { 
      console.log(err); 
    } else {
      self.content = [];
      console.log("Page.deleteContent -> deleted all content of: " + self.language + "/" + self.itemId);
      if (typeof next === "function") { next(); }
    }
  });
};


Page.prototype.fetchContent = function( app, language, itemId, next ) {
  var self = this;
  var nrC = 1;
  var nrI = 1;

  app.connection.query(
    "select * from content where item = ? and language = ? order by intro desc, sortorder asc",
    [itemId, language],
    function(err, result) {
      if (err) { 
        console.log(err); 
        throw(new Error("Page.loadContent failed with sql errors")); 
      }
      self.content = [];

      for (var i = 0; i < result.length; i++) {
        self.content[i] = new cody.Content(result[i], self, app);
        if (self.content[i].name === "") {
          if (self.content[i].isIntro()) {
            self.content[i].name = ("Intro"+nrI); nrI++;
          } else {
            self.content[i].name = ("Content"+nrC); nrC++;
          }
        }
        console.log("  " + self.content[i].name + " = " + self.content[i].data.length + " bytes");
      }

      if (typeof next === "function") { next(); }
    });
};

Page.prototype.updateContent = function( controller, finish ) {
  var self = this;
  
  cody.Application.each(self.content, function(next) {
    var aContent = this;
    aContent.scrapeFromWithId(controller);
    aContent.doUpdate(controller, false, next);
    
  }, function(err){
    self.sortContent();
    finish();
  });
};


Page.prototype.adjustContent = function( controller, finish ) {
  var self = this;
  console.log("Page.adjustContent: add correct Content for " + self.itemId);
  
  self.deleteContent( controller, function () {
    console.log("fetchContent for " + self.language + "/" + (-1 * self.item.templateId));
    self.fetchContent( controller.app, self.language, -1 * self.item.templateId, function() {
      cody.Application.each(self.content, function(next) {
        var aContent = this;
        aContent.doUpdate(controller, true, next);
        
      }, function(err){
        self.sortContent();
        finish();
      });
    });
  });
};


Page.prototype.addContent = function( controller, theKind, finish ) {
  var self = this;
  console.log("Page.addContent: add " + theKind + " content for " + self.itemId);
 
  var aContent = new cody.Content({kind: theKind}, self, controller.app);
  self.content.push( aContent );
  aContent.doUpdate(controller, true, function() {
    console.log("Page.addContent: added content id = " + aContent.id);
    finish(aContent.id);
  });
};
