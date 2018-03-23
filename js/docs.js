$(document).ready(function () {
  $('.form-checkbox').checkbox()
  $('.form-radio').radio()
  $('.form-select').selectbox()
  $('body').totop()
  $('#my-tooltip').qtip()
  $('#my-info-flag').qtip({
    content: {
      title: 'Info Flag',
      text: 'Info Flags are plain text informations attached to pieces content which will be displayed on mouseover.'
    }
  })

  $('#modal-init-demo2').on('show.tc.modal', function (event) {
    var $button = $(event.relatedTarget)
    var value = $button.data('init-value')

    var $modal = $(this)
    $modal.find('input[name="text-modal"]').val(value)
  })

  $('form[name="exampleModalForm3"]').on('submit', function (event) {
    event.preventDefault()

    var $modal = $('#modal-init-demo2')
    $modal.modal('hide')

    var $form = $(this)
    alert($form.serialize())
  })

  var $docsHeader = $('#DocsHeader')
  $docsHeader.fixation({
    offsetTop: function () {
      return -$docsHeader.find('.brandbar').height()
    }
  })

  $('.btn-sectioned').button()

  setOutline = function (e) {
    $( ".icon-list * .icon" ).each(function() {
     $(this).removeClass('icon-solid');
    })
  }

  setSolid = function (e) {
    $( ".icon-list * .icon" ).each(function() {
     $(this).addClass('icon-solid');
    })
  }

})

$(document)
  .on('click', '[data-toggle="theme"]', function (e) {
    var $button = $(this)
    var $body = $('body')
    $body.toggleClass('dark');
    if ($body.hasClass('dark')) {
      $button.addClass('active')
    } else {
      $button.removeClass('active')
    }
  })

$(window).load(function () {

  $('#exp-single').expandable();

  $('#exp-visible').click(function (e) {
    $('#exp-single').expandable("visible")
    $('#toggleBtn').button('active')
  })
  $('#exp-hidden').click(function (e) {
    $('#exp-single').expandable("hidden");
    $('#toggleBtn').button('default')
  })

  expandSingle = function () {
    $('#exp-single').expandable("toggleVisibility");
  }

  $('.expGroup').expandable({option: {group: 'expGroup'}});

  myFunctionExpand = function (element, event) {
    var elmTxt = element.text()
    switch (elmTxt) {
      case 'Text A':
        $('#exp-a').expandable("toggleVisibility");
        break
      case 'Text B':
        $('#exp-b').expandable("toggleVisibility");
        break
      case 'Text C':
        $('#exp-c').expandable("toggleVisibility");
        break
      case 'Text D':
        $('#exp-d').expandable("toggleVisibility");
        break
    }
  }
})

$(window).load(function () {
  $('#button-a').button('default')
  $('#button-b').button('active')
  $('#button-c').button('disable')
  $('#button-d').button('enable')

  $('#button-e').click(function (e) {
    $('#button-g').button("toggleactive");
  })
  $('#button-f').click(function (e) {
    $('#button-g').button("toggledisable");
  })

  myFunction = function (element, event) {
    $('#callbackOutput').text('callback = ' + element.text() + ' ' + event)
  }

  var text = ''
  myFunctionA = function (element, event) {
    text += 'callback from ' + element.text() + ' ' + event + '<br/>'
    $('#callbackOutput-a').html(text)
  }

  var textB = ''
  myFunctionB = function (element, event) {
    textB += 'callback from ' + element.text() + ' ' + event + '<br/>'
    $('#callbackOutput-b').html(textB)
  }

})
